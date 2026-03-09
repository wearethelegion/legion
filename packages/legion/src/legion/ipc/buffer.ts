/**
 * JSONL Stream Parser for IPC
 *
 * TCP is stream-oriented — messages may arrive fragmented across data
 * callbacks. This parser holds a partial line buffer, feeds incoming data,
 * splits on newlines, and only processes complete lines. Incomplete
 * trailing data is held for the next feed() call.
 */

import { Log } from "../../util/log"
import type { IpcMessage } from "./protocol"

const log = Log.create({ service: "legion.ipc.buffer" })

const decoder = new TextDecoder()

/** Max allowed message size in bytes (64KB) */
const MAX_MESSAGE_SIZE = 65_536

export class JsonlParser {
  private partial = ""

  /**
   * Feed incoming data from a socket. Returns an array of parsed
   * IpcMessage objects from all complete JSONL lines found.
   * Incomplete trailing data is buffered for the next feed().
   */
  feed(data: Buffer | Uint8Array): IpcMessage[] {
    const chunk = decoder.decode(data, { stream: true })
    this.partial += chunk

    const lines = this.partial.split("\n")
    // Last element is either "" (if data ended with \n) or a partial line
    this.partial = lines.pop()!

    const messages: IpcMessage[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (trimmed.length > MAX_MESSAGE_SIZE) {
        log.warn("IPC message exceeds max size, skipping", {
          size: String(trimmed.length),
          max: String(MAX_MESSAGE_SIZE),
        })
        continue
      }

      const msg = safeParse(trimmed)
      if (msg) messages.push(msg)
    }

    return messages
  }
}

function safeParse(line: string): IpcMessage | null {
  try {
    const parsed = JSON.parse(line)
    if (!parsed.type || !parsed.delegationId) {
      log.warn("IPC message missing required fields", {
        hasType: String(!!parsed.type),
        hasDelegationId: String(!!parsed.delegationId),
      })
      return null
    }
    return parsed as IpcMessage
  } catch (err) {
    log.warn("failed to parse IPC message", {
      error: err instanceof Error ? err.message : String(err),
      preview: line.slice(0, 100),
    })
    return null
  }
}
