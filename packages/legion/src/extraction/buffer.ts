/**
 * SQLite Durability Buffer for Extraction Results (Phase 1.2)
 *
 * Stores extraction results locally before draining to LEGION via gRPC.
 * Uses Bun's built-in SQLite for zero-dependency persistence.
 *
 * Flow: extractTurn() -> ExtractionBuffer.insert() -> ExtractionDrain -> gRPC
 */

import { Database } from "bun:sqlite"
import { Global } from "../global"
import { Log } from "../util/log"
import type { TurnExtraction } from "./schema"
import path from "path"

const log = Log.create({ service: "extraction.buffer" })

let db: Database | undefined

const DB_PATH = path.join(Global.Path.data, "extraction-buffer.db")

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS extraction_buffer (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    extraction_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    extraction_hash TEXT,
    UNIQUE(session_id, turn_number)
  )
`

const CREATE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_buffer_status ON extraction_buffer(status)
`

function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("PRAGMA synchronous = NORMAL")
  }
  return db
}

function simpleHash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}

export interface BufferRow {
  id: string
  session_id: string
  turn_number: number
  extraction_json: string
  status: string
  created_at: string
  retry_count: number
  last_error: string | null
  extraction_hash: string | null
}

export namespace ExtractionBuffer {
  export function init(): void {
    const d = getDb()
    d.exec(CREATE_TABLE)
    d.exec(CREATE_INDEX)
    log.info("buffer initialized", { path: DB_PATH })
  }

  export function insert(params: {
    sessionId: string
    turnNumber: number
    extraction: TurnExtraction
  }): string {
    const d = getDb()
    const id = crypto.randomUUID()
    const json = JSON.stringify(params.extraction)
    const hash = simpleHash(json)
    const now = new Date().toISOString()

    const stmt = d.prepare(`
      INSERT INTO extraction_buffer (id, session_id, turn_number, extraction_json, status, created_at, extraction_hash)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `)
    stmt.run(id, params.sessionId, params.turnNumber, json, now, hash)

    log.debug("buffered extraction", {
      id,
      sessionId: params.sessionId,
      turn: params.turnNumber,
    })
    return id
  }

  export function getPending(limit = 10): BufferRow[] {
    const d = getDb()
    const stmt = d.prepare(`
      SELECT * FROM extraction_buffer
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `)
    return stmt.all(limit) as BufferRow[]
  }

  export function markSending(ids: string[]): void {
    if (ids.length === 0) return
    const d = getDb()
    const placeholders = ids.map(() => "?").join(",")
    const stmt = d.prepare(`
      UPDATE extraction_buffer SET status = 'sending' WHERE id IN (${placeholders})
    `)
    stmt.run(...ids)
  }

  export function markSent(ids: string[]): void {
    if (ids.length === 0) return
    const d = getDb()
    const placeholders = ids.map(() => "?").join(",")
    const stmt = d.prepare(`
      UPDATE extraction_buffer SET status = 'sent' WHERE id IN (${placeholders})
    `)
    stmt.run(...ids)
  }

  export function markFailed(id: string, error: string): void {
    const d = getDb()
    const stmt = d.prepare(`
      UPDATE extraction_buffer
      SET status = 'failed', retry_count = retry_count + 1, last_error = ?
      WHERE id = ?
    `)
    stmt.run(error, id)
  }

  export function getRetryable(maxRetries = 5): BufferRow[] {
    const d = getDb()
    const stmt = d.prepare(`
      SELECT * FROM extraction_buffer
      WHERE status = 'failed' AND retry_count < ?
      ORDER BY created_at ASC
    `)
    return stmt.all(maxRetries) as BufferRow[]
  }

  export function getSessionExtractions(sessionId: string, limit = 5): BufferRow[] {
    const d = getDb()
    const stmt = d.prepare(`
      SELECT * FROM extraction_buffer
      WHERE session_id = ? AND status IN ('sent', 'sending', 'pending')
      ORDER BY turn_number DESC
      LIMIT ?
    `)
    return stmt.all(sessionId, limit) as BufferRow[]
  }

  export function cleanup(olderThanDays = 7): void {
    const d = getDb()
    const threshold = new Date(Date.now() - olderThanDays * 86400000).toISOString()
    const stmt = d.prepare(`
      DELETE FROM extraction_buffer WHERE status = 'sent' AND created_at < ?
    `)
    const result = stmt.run(threshold)
    log.info("buffer cleanup", { deleted: result.changes })
  }
}
