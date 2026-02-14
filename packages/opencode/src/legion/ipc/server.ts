/**
 * IPC Server — Parent Side
 *
 * The parent (orchestrator) listens on a Unix Domain Socket for child
 * connections. Each delegation gets its own socket for crash isolation.
 * Handles JSONL fragmentation via JsonlParser and provides a clean
 * event/command interface.
 *
 * Uses Node.js net module (Bun compat) for Unix socket servers.
 */

import net from "net"
import fs from "fs"
import { Log } from "../../util/log"
import { JsonlParser } from "./buffer"
import type { CancelCommand, ChildEvent, PingCommand } from "./protocol"

const log = Log.create({ service: "legion.ipc.server" })

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SOCKET_PATH = 104 // macOS limit
const MAX_MESSAGE_SIZE = 65_536

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventHandler = (event: ChildEvent) => void

/** Fields auto-populated by IpcServer on every send */
type AutoFields = "delegationId" | "ts"

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export class IpcServer {
  private server: net.Server
  private socketPath: string
  private client: net.Socket | null = null
  private parser = new JsonlParser()
  private handlers: EventHandler[] = []
  private closed = false

  private constructor(server: net.Server, socketPath: string) {
    this.server = server
    this.socketPath = socketPath

    server.on("connection", (socket) => {
      log.info("IPC child connected")
      this.client = socket

      socket.on("data", (data: Buffer) => {
        const messages = this.parser.feed(data)
        for (const msg of messages) {
          for (const handler of this.handlers) {
            handler(msg as ChildEvent)
          }
        }
      })

      socket.on("error", (err) => {
        log.warn("IPC child socket error", { error: err.message })
      })

      socket.on("close", () => {
        log.info("IPC child disconnected")
        if (this.client === socket) this.client = null
      })
    })

    server.on("error", (err) => {
      log.warn("IPC server error", { error: err.message })
    })
  }

  /**
   * Create server and listen on Unix Domain Socket.
   * Cleans up stale socket file if it exists.
   */
  static async listen(socketPath: string): Promise<IpcServer> {
    if (socketPath.length > MAX_SOCKET_PATH) {
      throw new Error(`Socket path exceeds macOS limit: ${socketPath.length} > ${MAX_SOCKET_PATH}`)
    }

    // Remove stale socket file
    try {
      fs.unlinkSync(socketPath)
    } catch {
      // File doesn't exist — fine
    }

    const server = net.createServer()

    return new Promise((resolve, reject) => {
      server.once("error", reject)

      server.listen(socketPath, () => {
        server.removeAllListeners("error")
        log.info("IPC server listening", { socketPath })
        resolve(new IpcServer(server, socketPath))
      })
    })
  }

  /** Register handler for child events */
  onEvent(handler: EventHandler): void {
    this.handlers.push(handler)
  }

  /**
   * Send a command to the connected child.
   * Auto-injects delegationId and ts fields.
   */
  send(cmd: Omit<CancelCommand, AutoFields> | Omit<PingCommand, AutoFields>, delegationId: string): void {
    if (!this.client || this.closed) return

    const msg = {
      ...cmd,
      delegationId,
      ts: Date.now(),
    }

    const line = JSON.stringify(msg)
    if (line.length > MAX_MESSAGE_SIZE) {
      log.warn("IPC command too large, dropping", {
        type: cmd.type,
        size: String(line.length),
      })
      return
    }

    this.client.write(line + "\n")
  }

  /** Clean shutdown — close socket, remove socket file */
  close(): void {
    this.closed = true

    if (this.client) {
      this.client.end()
      this.client = null
    }

    this.server.close()

    try {
      fs.unlinkSync(this.socketPath)
    } catch {
      // Already gone
    }

    log.info("IPC server closed", { socketPath: this.socketPath })
  }
}
