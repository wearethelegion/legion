import { describe, expect, test, afterEach } from "bun:test"
import net from "net"
import fs from "fs"
import path from "path"
import os from "os"
import { IpcServer } from "../../../src/legion/ipc/server"
import { IpcClient } from "../../../src/legion/ipc/client"

/** Create a unique temp socket path under OS tmpdir */
function tmpSock(): string {
  const id = Math.random().toString(36).slice(2, 8)
  return path.join(os.tmpdir(), `ipc-int-${id}.sock`)
}

// Track resources for cleanup
const cleanupPaths: string[] = []
const cleanupServers: IpcServer[] = []
const cleanupClients: IpcClient[] = []

afterEach(() => {
  for (const c of cleanupClients) {
    try { c.close() } catch {}
  }
  cleanupClients.length = 0
  for (const s of cleanupServers) {
    try { s.close() } catch {}
  }
  cleanupServers.length = 0
  for (const p of cleanupPaths) {
    try { fs.unlinkSync(p) } catch {}
  }
  cleanupPaths.length = 0
})

describe("IPC Integration (client + server)", () => {
  // ---------------------------------------------------------------------------
  // Basic flow: client emits event → server receives it
  // ---------------------------------------------------------------------------

  test("server receives event emitted by client", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)

    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const received: any[] = []
    server.onEvent((event) => received.push(event))

    const client = await IpcClient.connect(sockPath, "del-int-1")
    expect(client).not.toBeNull()
    cleanupClients.push(client!)

    client!.emitStatus("running", "hello from client")

    await new Promise((r) => setTimeout(r, 150))

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe("status")
    expect(received[0].status).toBe("running")
    expect(received[0].message).toBe("hello from client")
    expect(received[0].delegationId).toBe("del-int-1")
  })

  // ---------------------------------------------------------------------------
  // Server sends command → client receives via onCommand
  // ---------------------------------------------------------------------------

  test("client onCommand handler receives server command", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)

    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const client = await IpcClient.connect(sockPath, "del-int-2")
    expect(client).not.toBeNull()
    cleanupClients.push(client!)

    const commands: any[] = []
    client!.onCommand((cmd) => commands.push(cmd))

    // Wait for server to register the connection
    await new Promise((r) => setTimeout(r, 100))

    server.send({ type: "cancel", reason: "user abort" }, "del-int-2")

    await new Promise((r) => setTimeout(r, 150))

    expect(commands).toHaveLength(1)
    expect(commands[0].type).toBe("cancel")
    expect(commands[0].reason).toBe("user abort")
    expect(commands[0].delegationId).toBe("del-int-2")
  })

  // ---------------------------------------------------------------------------
  // Cancel flow
  // ---------------------------------------------------------------------------

  test("full cancel flow: server cancels → client receives cancel command", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)

    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const client = await IpcClient.connect(sockPath, "del-cancel")
    expect(client).not.toBeNull()
    cleanupClients.push(client!)

    // Track server events and client commands
    const serverEvents: any[] = []
    const clientCommands: any[] = []

    server.onEvent((e) => serverEvents.push(e))
    client!.onCommand((c) => clientCommands.push(c))

    await new Promise((r) => setTimeout(r, 100))

    // Client sends status, server sends cancel, client acknowledges
    client!.emitStatus("running")

    await new Promise((r) => setTimeout(r, 100))
    expect(serverEvents).toHaveLength(1)
    expect(serverEvents[0].type).toBe("status")

    server.send({ type: "cancel", reason: "orchestrator decision" }, "del-cancel")

    await new Promise((r) => setTimeout(r, 100))
    expect(clientCommands).toHaveLength(1)
    expect(clientCommands[0].type).toBe("cancel")

    // Client acknowledges cancellation
    client!.emitStatus("cancelled", "cancel acknowledged")

    await new Promise((r) => setTimeout(r, 100))
    expect(serverEvents).toHaveLength(2)
    expect(serverEvents[1].status).toBe("cancelled")
  })

  // ---------------------------------------------------------------------------
  // Ping/Pong
  // ---------------------------------------------------------------------------

  test("ping/pong: server pings → client responds with pong", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)

    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const client = await IpcClient.connect(sockPath, "del-ping")
    expect(client).not.toBeNull()
    cleanupClients.push(client!)

    const serverEvents: any[] = []
    server.onEvent((e) => serverEvents.push(e))

    // Wire up client to auto-respond to ping
    client!.onCommand((cmd) => {
      if (cmd.type === "ping") {
        client!.emitPong()
      }
    })

    await new Promise((r) => setTimeout(r, 100))

    server.send({ type: "ping" }, "del-ping")

    await new Promise((r) => setTimeout(r, 200))

    expect(serverEvents).toHaveLength(1)
    expect(serverEvents[0].type).toBe("pong")
    expect(serverEvents[0].delegationId).toBe("del-ping")
  })

  // ---------------------------------------------------------------------------
  // Multiple rapid events don't lose data
  // ---------------------------------------------------------------------------

  test("20 rapid events all arrive at server in order", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)

    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const received: any[] = []
    server.onEvent((event) => received.push(event))

    const client = await IpcClient.connect(sockPath, "del-rapid")
    expect(client).not.toBeNull()
    cleanupClients.push(client!)

    for (let i = 0; i < 20; i++) {
      client!.emitAction(`step-${i}`)
    }

    // Wait for all events to propagate
    await new Promise((r) => setTimeout(r, 300))

    expect(received).toHaveLength(20)
    for (let i = 0; i < 20; i++) {
      expect(received[i].action).toBe(`step-${i}`)
    }
  })

  // ---------------------------------------------------------------------------
  // Server close → client handles disconnection
  // ---------------------------------------------------------------------------

  test("client handles server shutdown gracefully", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)

    const server = await IpcServer.listen(sockPath)

    const client = await IpcClient.connect(sockPath, "del-disc")
    expect(client).not.toBeNull()
    cleanupClients.push(client!)

    // Server closes connection
    server.close()

    // Wait for close to propagate
    await new Promise((r) => setTimeout(r, 150))

    // Client should be in degraded mode now — emits are no-ops, no errors thrown
    client!.emitStatus("running")
    client!.emitAction("should be no-op")
  })

  // ---------------------------------------------------------------------------
  // Bidirectional multi-message flow
  // ---------------------------------------------------------------------------

  test("full bidirectional conversation: events + commands interleaved", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)

    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const serverEvents: any[] = []
    const clientCommands: any[] = []

    server.onEvent((e) => serverEvents.push(e))

    const client = await IpcClient.connect(sockPath, "del-bidir")
    expect(client).not.toBeNull()
    cleanupClients.push(client!)

    client!.onCommand((c) => clientCommands.push(c))

    await new Promise((r) => setTimeout(r, 100))

    // Client: connected
    client!.emitConnected({
      agentId: "a-1",
      agentName: "Tommy",
      agentRole: "developer",
      model: "opus",
      task: "implement feature",
      pid: process.pid,
    })
    await new Promise((r) => setTimeout(r, 50))

    // Client: status running
    client!.emitStatus("running")
    await new Promise((r) => setTimeout(r, 50))

    // Server: ping
    server.send({ type: "ping" }, "del-bidir")
    await new Promise((r) => setTimeout(r, 50))

    // Client: pong + tool start
    client!.emitPong()
    client!.emitToolStart("Bash", { command: "make build" })
    await new Promise((r) => setTimeout(r, 50))

    // Client: tool end + result
    client!.emitToolEnd("Bash", 5000, true, "build successful")
    client!.emitStatus("completed")
    client!.emitResult({
      summary: "Feature implemented",
      toolsUsed: ["Bash"],
      turns: 3,
      costUsd: 0.15,
      durationMs: 10000,
    })

    await new Promise((r) => setTimeout(r, 200))

    // Verify server got all events
    expect(serverEvents.length).toBeGreaterThanOrEqual(7)
    expect(serverEvents[0].type).toBe("connected")
    expect(serverEvents[1].type).toBe("status")
    expect(serverEvents[1].status).toBe("running")

    // Verify client got the ping command
    expect(clientCommands).toHaveLength(1)
    expect(clientCommands[0].type).toBe("ping")
  })

  // ---------------------------------------------------------------------------
  // JSONL fragmentation: send partial chunks via raw socket
  // ---------------------------------------------------------------------------

  test("fragmented JSONL reassembled correctly by server", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)

    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const received: any[] = []
    server.onEvent((e) => received.push(e))

    // Connect via raw net.Socket (not IpcClient) to control fragmentation
    const rawClient = await new Promise<net.Socket>((resolve) => {
      const c = net.createConnection({ path: sockPath })
      c.once("connect", () => resolve(c))
    })

    const fullLine = JSON.stringify({
      type: "status",
      delegationId: "del-frag",
      ts: Date.now(),
      status: "running",
    })

    // Fragment the message into 3 pieces
    const third = Math.floor(fullLine.length / 3)
    rawClient.write(fullLine.slice(0, third))
    await new Promise((r) => setTimeout(r, 30))
    rawClient.write(fullLine.slice(third, third * 2))
    await new Promise((r) => setTimeout(r, 30))
    rawClient.write(fullLine.slice(third * 2) + "\n")

    await new Promise((r) => setTimeout(r, 150))

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe("status")
    expect(received[0].delegationId).toBe("del-frag")

    rawClient.end()
  })
})
