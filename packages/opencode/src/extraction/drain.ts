/**
 * Background Drain Loop (Phase 1.5)
 *
 * Periodically drains the SQLite extraction buffer to LEGION via gRPC.
 * Handles retries with exponential backoff. Designed for graceful startup
 * and shutdown — drain pending items on start, flush on stop.
 */

import type { TurnExtractionProto } from "@opencode-ai/legion-client"
import { getLegionClient, isLegionAvailable } from "../legion/auth"
import { Config } from "../config/config"
import { Log } from "../util/log"
import { ExtractionBuffer, type BufferRow } from "./buffer"
import type { TurnExtraction } from "./schema"

const log = Log.create({ service: "extraction.drain" })

function mapToProto(ext: TurnExtraction): TurnExtractionProto {
  return {
    concepts: ext.concepts.map((c) => ({
      name: c.entity,
      type: c.type,
      sentiment: c.context,
    })),
    decisions: ext.decisions.map((d) => ({
      summary: d.choice,
      chose: d.chosen,
      rejected: d.rejected ? [d.rejected] : [],
      reasoning: d.reasoning,
      confidence: "",
    })),
    preferences: ext.preferences.map((p) => ({
      category: p.category,
      key: p.key,
      value: p.value,
      strength: p.source,
    })),
    topics: ext.topics.map((t) => ({
      name: t.name,
      status: t.status,
    })),
    code_refs: ext.code_references.map((cr) => ({
      file: cr.path,
      entity: cr.name,
      action: cr.action,
    })),
    intent: ext.intent,
    urgency: ext.urgency,
    active_engagement_id: ext.legion_context?.engagement_id ?? "",
    active_task_id: ext.legion_context?.task_id ?? "",
    active_delegation_id: ext.legion_context?.delegation_id ?? "",
  }
}

const DEFAULT_INTERVAL_MS = 3000
const MAX_RETRIES = 5

let timer: ReturnType<typeof setInterval> | undefined
let running = false

export namespace ExtractionDrain {
  /**
   * Start the background drain loop.
   * Also drains any pending items from a previous session crash.
   */
  export function start(intervalMs = DEFAULT_INTERVAL_MS): void {
    if (timer) return
    running = true
    log.info("drain loop starting", { intervalMs })

    // Drain on startup (crash recovery)
    drainOnce()

    timer = setInterval(() => {
      if (running) drainOnce()
    }, intervalMs)
  }

  /**
   * Stop the drain loop. Performs one final drain before stopping.
   */
  export async function stop(): Promise<void> {
    running = false
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
    log.info("drain loop stopping — final drain")
    await drainOnce()
    log.info("drain loop stopped")
  }

  /**
   * Single drain cycle. Processes pending items and retryable failures.
   * Safe to call concurrently — uses the `running` flag as guard.
   */
  export async function drainOnce(): Promise<void> {
    if (!isLegionAvailable()) return

    const cfg = await Config.get()
    if (cfg.legion?.extraction?.enabled === false) return

    try {
      // Process pending items
      const pending = ExtractionBuffer.getPending(10)
      if (pending.length > 0) {
        const ids = pending.map((r) => r.id)
        ExtractionBuffer.markSending(ids)
        await sendBatch(pending)
      }

      // Process retryable failures
      const retryable = ExtractionBuffer.getRetryable(MAX_RETRIES)
      if (retryable.length > 0) {
        const ids = retryable.map((r) => r.id)
        ExtractionBuffer.markSending(ids)
        await sendBatch(retryable)
      }
    } catch (err) {
      log.error("drain cycle failed", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * Send a batch of buffer rows to LEGION via gRPC.
   * Each item is sent individually — failure of one doesn't block others.
   */
  async function sendBatch(rows: BufferRow[]): Promise<void> {
    for (const row of rows) {
      try {
        const client = getLegionClient()
        if (!client) throw new Error("LEGION client not available")
        const extraction = JSON.parse(row.extraction_json) as TurnExtraction
        const response = await client.storeExtraction({
          sessionId: row.session_id,
          turnNumber: row.turn_number,
          extraction: mapToProto(extraction),
          engagementId: extraction.legion_context?.engagement_id ?? "",
          taskId: extraction.legion_context?.task_id ?? "",
          delegationId: extraction.legion_context?.delegation_id ?? "",
        })

        if (!response.success) {
          throw new Error(response.error_message || "StoreExtraction returned success=false")
        }

        ExtractionBuffer.markSent([row.id])
        log.debug("drained", { id: row.id, session: row.session_id, turn: row.turn_number })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ExtractionBuffer.markFailed(row.id, msg)
        log.warn("drain failed for item", { id: row.id, error: msg, retries: row.retry_count })
      }
    }
  }
}
