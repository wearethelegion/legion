/**
 * IPC Client — Child Side
 *
 * The child (delegated agent) connects to the parent's Unix Domain Socket
 * to stream events. Supports degraded mode: if connection fails after
 * retries, all emit calls become no-ops.
 *
 * Uses Node.js net module (Bun compat) for Unix socket connections.
 */

import net from "net"
import { Log } from "../../util/log"
import { JsonlParser } from "./buffer"
import type {
  ChildEvent,
  ParentCommand,
  StatusEvent,
  ToolStartEvent,
  ToolEndEvent,
  TokensEvent,
  TurnEvent,
  ErrorEvent,
  ResultEvent,
  ConnectedEvent,
  ActionEvent,
} from "./protocol"

const log = Log.create({ service: "legion.ipc.client" })

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3
const BASE_RETRY_MS = 500
const MAX_SOCKET_PATH = 104 // macOS limit
const MAX_INPUT_SIZE = 2048
const MAX_PREVIEW_SIZE = 500
const MAX_MESSAGE_SIZE = 65_536

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommandHandler = (cmd: ParentCommand) => void

/** Fields auto-populated by IpcClient on every emit */
type AutoFields = "delegationId" | "ts"

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class IpcClient {
  private socket: net.Socket | null
  private parser = new JsonlParser()
  private handlers: CommandHandler[] = []
  private delegationId: string
  private closed = false

  private constructor(socket: net.Socket | null, delegationId: string) {
    this.socket = socket
    this.delegationId = delegationId

    if (!socket) return

    socket.on("data", (data: Buffer) => {
      const messages = this.parser.feed(data)
      for (const msg of messages) {
        for (const handler of this.handlers) {
          handler(msg as ParentCommand)
        }
      }
    })

    socket.on("error", (err) => {
      log.warn("IPC socket error", { error: err.message })
    })

    socket.on("close", () => {
      log.info("IPC socket closed")
      this.socket = null
    })
  }

  /**
   * Connect to parent's Unix Domain Socket.
   * Retries 3x with 500ms * attempt backoff.
   * Returns null on failure (degraded mode).
   */
  static async connect(socketPath: string, delegationId: string): Promise<IpcClient | null> {
    if (process.platform !== "win32" && socketPath.length > MAX_SOCKET_PATH) {
      log.warn("socket path exceeds Unix socket limit", {
        length: String(socketPath.length),
        max: String(MAX_SOCKET_PATH),
      })
      return null
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const socket = await tryConnect(socketPath)
      if (socket) {
        log.info("IPC client connected", { socketPath, attempt: String(attempt) })
        return new IpcClient(socket, delegationId)
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_MS * attempt
        log.info("IPC connect retry", { attempt: String(attempt), delayMs: String(delay) })
        await sleep(delay)
      }
    }

    log.warn("IPC connection failed after retries — degraded mode", {
      socketPath,
      retries: String(MAX_RETRIES),
    })
    return new IpcClient(null, delegationId)
  }

  /**
   * Emit a child event to the parent. No-op in degraded mode.
   * Auto-injects delegationId and ts fields.
   */
  emit(event: { type: ChildEvent["type"] } & Record<string, unknown>): void {
    if (!this.socket || this.closed) return

    const msg = {
      ...event,
      delegationId: this.delegationId,
      ts: Date.now(),
    }

    const line = JSON.stringify(msg)
    if (line.length > MAX_MESSAGE_SIZE) {
      log.warn("IPC message too large, dropping", {
        type: event.type,
        size: String(line.length),
      })
      return
    }

    this.socket.write(line + "\n")
  }

  // -------------------------------------------------------------------------
  // Convenience emitters
  // -------------------------------------------------------------------------

  emitConnected(data: Omit<ConnectedEvent, "type" | AutoFields>): void {
    this.emit({ type: "connected" as const, ...data })
  }

  emitStatus(status: StatusEvent["status"], message?: string): void {
    this.emit({ type: "status" as const, status, message })
  }

  emitAction(action: string, tool?: string): void {
    this.emit({ type: "action" as const, action, tool })
  }

  emitToolStart(tool: string, input: Record<string, unknown>): void {
    const serialized = JSON.stringify(input)
    const truncated =
      serialized.length > MAX_INPUT_SIZE ? { _truncated: true, preview: serialized.slice(0, MAX_INPUT_SIZE) } : input

    this.emit({ type: "tool_start" as const, tool, input: truncated })
  }

  emitToolEnd(tool: string, durationMs: number, success: boolean, outputPreview?: string): void {
    const preview =
      outputPreview && outputPreview.length > MAX_PREVIEW_SIZE
        ? outputPreview.slice(0, MAX_PREVIEW_SIZE)
        : outputPreview

    this.emit({ type: "tool_end" as const, tool, durationMs, success, outputPreview: preview })
  }

  emitTokens(data: Omit<TokensEvent, "type" | AutoFields>): void {
    this.emit({ type: "tokens" as const, ...data })
  }

  emitTurn(data: Omit<TurnEvent, "type" | AutoFields>): void {
    const preview =
      data.contentPreview.length > MAX_PREVIEW_SIZE
        ? data.contentPreview.slice(0, MAX_PREVIEW_SIZE)
        : data.contentPreview

    this.emit({ type: "turn" as const, ...data, contentPreview: preview })
  }

  emitError(error: string, recoverable: boolean, category?: ErrorEvent["category"]): void {
    this.emit({ type: "error" as const, error, recoverable, category })
  }

  emitResult(data: Omit<ResultEvent, "type" | AutoFields>): void {
    this.emit({ type: "result" as const, ...data })
  }

  emitPong(): void {
    this.emit({ type: "pong" as const })
  }

  // -------------------------------------------------------------------------
  // Command handling
  // -------------------------------------------------------------------------

  /** Register a handler for parent commands (cancel, ping) */
  onCommand(handler: CommandHandler): void {
    this.handlers.push(handler)
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Clean shutdown */
  close(): void {
    this.closed = true
    if (this.socket) {
      this.socket.end()
      this.socket = null
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryConnect(socketPath: string): Promise<net.Socket | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ path: socketPath })

    socket.once("connect", () => {
      socket.removeAllListeners("error")
      resolve(socket)
    })

    socket.once("error", () => {
      socket.destroy()
      resolve(null)
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
