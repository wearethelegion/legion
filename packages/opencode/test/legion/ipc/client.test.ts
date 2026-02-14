import { describe, expect, test, afterEach } from "bun:test"
import net from "net"
import fs from "fs"
import path from "path"
import os from "os"
import { IpcClient } from "../../../src/legion/ipc/client"

/** Create a unique temp socket path under OS tmpdir (well under 104-char macOS limit) */
function tmpSock(): string {
  const id = Math.random().toString(36).slice(2, 8)
  return path.join(os.tmpdir(), `ipc-test-${id}.sock`)
}

/** Start a net server on a Unix socket and return it + the socket path */
function startServer(sockPath: string): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(sockPath, () => {
      server.removeAllListeners("error")
      resolve(server)
    })
  })
}

/** Collect data written by a client socket on the server side */
function collectServerData(server: net.Server): Promise<string> {
  return new Promise((resolve) => {
    server.once("connection", (socket) => {
      let buf = ""
      socket.on("data", (chunk: Buffer) => {
        buf += chunk.toString()
      })
      socket.on("end", () => resolve(buf))
      socket.on("close", () => resolve(buf))
    })
  })
}

// Track sockets and servers for cleanup
const cleanupPaths: string[] = []
const cleanupServers: net.Server[] = []

afterEach(() => {
  for (const s of cleanupServers) {
    try { s.close() } catch {}
  }
  cleanupServers.length = 0
  for (const p of cleanupPaths) {
    try { fs.unlinkSync(p) } catch {}
  }
  cleanupPaths.length = 0
})

describe("IpcClient", () => {
  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  test("connects to a Unix socket server", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)

    const client = await IpcClient.connect(sockPath, "del-1")
    expect(client).not.toBeNull()
    client!.close()
  })

  // ---------------------------------------------------------------------------
  // Socket path validation
  // ---------------------------------------------------------------------------

  test("returns null for socket path exceeding macOS 104-char limit", async () => {
    const longPath = "/tmp/" + "a".repeat(110) + ".sock"
    const client = await IpcClient.connect(longPath, "del-1")
    expect(client).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Degraded mode (null socket)
  // ---------------------------------------------------------------------------

  test("returns degraded client (non-null) when server is unreachable", async () => {
    // No server listening at this path
    const client = await IpcClient.connect("/tmp/nonexistent-ipc-test.sock", "del-1")
    // connect() returns IpcClient in degraded mode (null socket), not null
    expect(client).not.toBeNull()
    // Emits should be no-ops — no errors thrown
    client!.emitStatus("running")
    client!.emitAction("test")
    client!.emitError("oops", true)
    client!.emitPong()
    client!.close()
  })

  // ---------------------------------------------------------------------------
  // emit() produces correct JSONL
  // ---------------------------------------------------------------------------

  test("emitStatus writes correct JSONL to socket", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-1")
    expect(client).not.toBeNull()
    client!.emitStatus("running", "all good")
    client!.close()

    const raw = await dataPromise
    const lines = raw.trim().split("\n")
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const parsed = JSON.parse(lines[0])
    expect(parsed.type).toBe("status")
    expect(parsed.status).toBe("running")
    expect(parsed.message).toBe("all good")
    expect(parsed.delegationId).toBe("del-1")
    expect(typeof parsed.ts).toBe("number")
  })

  test("emitAction writes correct JSONL", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-2")
    client!.emitAction("reading file", "Read")
    client!.close()

    const raw = await dataPromise
    const parsed = JSON.parse(raw.trim().split("\n")[0])
    expect(parsed.type).toBe("action")
    expect(parsed.action).toBe("reading file")
    expect(parsed.tool).toBe("Read")
    expect(parsed.delegationId).toBe("del-2")
  })

  test("emitConnected writes correct JSONL", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-3")
    client!.emitConnected({
      agentId: "agent-1",
      agentName: "Tommy",
      agentRole: "developer",
      model: "opus",
      task: "build stuff",
      pid: 12345,
    })
    client!.close()

    const raw = await dataPromise
    const parsed = JSON.parse(raw.trim().split("\n")[0])
    expect(parsed.type).toBe("connected")
    expect(parsed.agentId).toBe("agent-1")
    expect(parsed.agentName).toBe("Tommy")
    expect(parsed.pid).toBe(12345)
    expect(parsed.delegationId).toBe("del-3")
  })

  test("emitToolStart writes correct JSONL", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-4")
    client!.emitToolStart("Bash", { command: "ls -la" })
    client!.close()

    const raw = await dataPromise
    const parsed = JSON.parse(raw.trim().split("\n")[0])
    expect(parsed.type).toBe("tool_start")
    expect(parsed.tool).toBe("Bash")
    expect(parsed.input.command).toBe("ls -la")
  })

  test("emitToolEnd writes correct JSONL", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-5")
    client!.emitToolEnd("Bash", 150, true, "file1.ts\nfile2.ts")
    client!.close()

    const raw = await dataPromise
    const parsed = JSON.parse(raw.trim().split("\n")[0])
    expect(parsed.type).toBe("tool_end")
    expect(parsed.tool).toBe("Bash")
    expect(parsed.durationMs).toBe(150)
    expect(parsed.success).toBe(true)
    expect(parsed.outputPreview).toBe("file1.ts\nfile2.ts")
  })

  test("emitTokens writes correct JSONL", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-6")
    client!.emitTokens({
      turn: 1,
      inputTokens: 500,
      outputTokens: 200,
      cacheReadTokens: 50,
      cacheWriteTokens: 25,
      turnCostUsd: 0.01,
      totalCostUsd: 0.01,
    })
    client!.close()

    const raw = await dataPromise
    const parsed = JSON.parse(raw.trim().split("\n")[0])
    expect(parsed.type).toBe("tokens")
    expect(parsed.inputTokens).toBe(500)
    expect(parsed.outputTokens).toBe(200)
    expect(parsed.turnCostUsd).toBe(0.01)
  })

  test("emitTurn writes correct JSONL with preview truncation", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const longPreview = "x".repeat(1000)
    const client = await IpcClient.connect(sockPath, "del-7")
    client!.emitTurn({
      turn: 2,
      role: "assistant",
      contentPreview: longPreview,
      toolCallCount: 3,
    })
    client!.close()

    const raw = await dataPromise
    const parsed = JSON.parse(raw.trim().split("\n")[0])
    expect(parsed.type).toBe("turn")
    expect(parsed.turn).toBe(2)
    expect(parsed.role).toBe("assistant")
    // Preview is truncated to 500 chars
    expect(parsed.contentPreview.length).toBe(500)
    expect(parsed.toolCallCount).toBe(3)
  })

  test("emitError writes correct JSONL", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-8")
    client!.emitError("something broke", false, "tool")
    client!.close()

    const raw = await dataPromise
    const parsed = JSON.parse(raw.trim().split("\n")[0])
    expect(parsed.type).toBe("error")
    expect(parsed.error).toBe("something broke")
    expect(parsed.recoverable).toBe(false)
    expect(parsed.category).toBe("tool")
  })

  test("emitResult writes correct JSONL", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-9")
    client!.emitResult({
      summary: "Done",
      toolsUsed: ["Bash", "Read"],
      turns: 5,
      costUsd: 0.10,
      durationMs: 30000,
    })
    client!.close()

    const raw = await dataPromise
    const parsed = JSON.parse(raw.trim().split("\n")[0])
    expect(parsed.type).toBe("result")
    expect(parsed.summary).toBe("Done")
    expect(parsed.toolsUsed).toEqual(["Bash", "Read"])
    expect(parsed.turns).toBe(5)
    expect(parsed.costUsd).toBe(0.10)
    expect(parsed.durationMs).toBe(30000)
  })

  test("emitPong writes correct JSONL", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-10")
    client!.emitPong()
    client!.close()

    const raw = await dataPromise
    const parsed = JSON.parse(raw.trim().split("\n")[0])
    expect(parsed.type).toBe("pong")
    expect(parsed.delegationId).toBe("del-10")
  })

  // ---------------------------------------------------------------------------
  // Command handling
  // ---------------------------------------------------------------------------

  test("onCommand handler receives parent commands", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)

    // Wait for client to connect, then send a command from server
    const clientSocketPromise = new Promise<net.Socket>((resolve) => {
      server.once("connection", (socket) => resolve(socket))
    })

    const client = await IpcClient.connect(sockPath, "del-cmd")
    expect(client).not.toBeNull()

    const received: any[] = []
    client!.onCommand((cmd) => received.push(cmd))

    const clientSocket = await clientSocketPromise
    // Server sends a cancel command as JSONL
    const cancelCmd = JSON.stringify({
      type: "cancel",
      delegationId: "del-cmd",
      ts: Date.now(),
      reason: "user abort",
    })
    clientSocket.write(cancelCmd + "\n")

    // Wait for data to propagate
    await new Promise((r) => setTimeout(r, 100))

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe("cancel")
    expect(received[0].reason).toBe("user abort")

    client!.close()
    clientSocket.end()
  })

  // ---------------------------------------------------------------------------
  // close() behavior
  // ---------------------------------------------------------------------------

  test("close() prevents further emits", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-close")
    client!.emitStatus("running")
    client!.close()
    // After close, these should be no-ops
    client!.emitStatus("completed")
    client!.emitAction("should not appear")

    const raw = await dataPromise
    const lines = raw.trim().split("\n").filter(Boolean)
    // Only the first emit before close should have been sent
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).status).toBe("running")
  })

  // ---------------------------------------------------------------------------
  // Multiple emitters
  // ---------------------------------------------------------------------------

  test("multiple rapid emits all arrive at server", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await startServer(sockPath)
    cleanupServers.push(server)
    const dataPromise = collectServerData(server)

    const client = await IpcClient.connect(sockPath, "del-multi")
    for (let i = 0; i < 20; i++) {
      client!.emitStatus("running", `msg-${i}`)
    }
    client!.close()

    const raw = await dataPromise
    const lines = raw.trim().split("\n").filter(Boolean)
    expect(lines).toHaveLength(20)
    for (let i = 0; i < 20; i++) {
      const parsed = JSON.parse(lines[i])
      expect(parsed.message).toBe(`msg-${i}`)
    }
  })
})
