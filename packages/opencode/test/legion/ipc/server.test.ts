import { describe, expect, test, afterEach } from "bun:test"
import net from "net"
import fs from "fs"
import path from "path"
import os from "os"
import { IpcServer } from "../../../src/legion/ipc/server"

/** Create a unique temp socket path under OS tmpdir */
function tmpSock(): string {
  const id = Math.random().toString(36).slice(2, 8)
  return path.join(os.tmpdir(), `ipc-srv-${id}.sock`)
}

// Track resources for cleanup
const cleanupPaths: string[] = []
const cleanupServers: IpcServer[] = []

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

describe("IpcServer", () => {
  // ---------------------------------------------------------------------------
  // Listen
  // ---------------------------------------------------------------------------

  test("listen() creates a Unix socket and accepts connections", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    // Socket file should exist
    expect(fs.existsSync(sockPath)).toBe(true)

    // Should accept a client connection
    const client = await new Promise<net.Socket>((resolve) => {
      const c = net.createConnection({ path: sockPath })
      c.once("connect", () => resolve(c))
    })
    expect(client).toBeTruthy()
    client.end()
  })

  test("listen() cleans up stale socket file", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)

    // Create a stale socket file
    fs.writeFileSync(sockPath, "stale")
    expect(fs.existsSync(sockPath)).toBe(true)

    // listen() should remove it and start fresh
    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)
    expect(fs.existsSync(sockPath)).toBe(true)
  })

  test("listen() throws for socket path exceeding macOS 104-char limit", async () => {
    const longPath = "/tmp/" + "a".repeat(110) + ".sock"
    await expect(IpcServer.listen(longPath)).rejects.toThrow("macOS limit")
  })

  // ---------------------------------------------------------------------------
  // onEvent — receiving child events
  // ---------------------------------------------------------------------------

  test("onEvent handler receives parsed JSONL events from clients", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const received: any[] = []
    server.onEvent((event) => received.push(event))

    // Connect a raw client and send a JSONL event
    const client = await new Promise<net.Socket>((resolve) => {
      const c = net.createConnection({ path: sockPath })
      c.once("connect", () => resolve(c))
    })

    const event = JSON.stringify({
      type: "status",
      delegationId: "d-1",
      ts: Date.now(),
      status: "running",
    })
    client.write(event + "\n")

    await new Promise((r) => setTimeout(r, 100))

    expect(received).toHaveLength(1)
    expect(received[0].type).toBe("status")
    expect(received[0].delegationId).toBe("d-1")

    client.end()
  })

  test("onEvent receives multiple events from a single client", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const received: any[] = []
    server.onEvent((event) => received.push(event))

    const client = await new Promise<net.Socket>((resolve) => {
      const c = net.createConnection({ path: sockPath })
      c.once("connect", () => resolve(c))
    })

    // Send 5 events rapidly
    for (let i = 0; i < 5; i++) {
      const event = JSON.stringify({
        type: "action",
        delegationId: "d-1",
        ts: Date.now(),
        action: `step-${i}`,
      })
      client.write(event + "\n")
    }

    await new Promise((r) => setTimeout(r, 150))

    expect(received).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      expect(received[i].action).toBe(`step-${i}`)
    }

    client.end()
  })

  // ---------------------------------------------------------------------------
  // send() — sending commands to child
  // ---------------------------------------------------------------------------

  test("send() writes JSONL command to connected client", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const client = await new Promise<net.Socket>((resolve) => {
      const c = net.createConnection({ path: sockPath })
      c.once("connect", () => resolve(c))
    })

    // Wait for server to register the client
    await new Promise((r) => setTimeout(r, 50))

    // Collect data on client side
    const received: string[] = []
    client.on("data", (chunk: Buffer) => {
      received.push(chunk.toString())
    })

    server.send({ type: "cancel", reason: "timeout" }, "d-1")

    await new Promise((r) => setTimeout(r, 100))

    const allData = received.join("")
    const parsed = JSON.parse(allData.trim().split("\n")[0])
    expect(parsed.type).toBe("cancel")
    expect(parsed.reason).toBe("timeout")
    expect(parsed.delegationId).toBe("d-1")
    expect(typeof parsed.ts).toBe("number")

    client.end()
  })

  test("send() with ping command", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await IpcServer.listen(sockPath)
    cleanupServers.push(server)

    const client = await new Promise<net.Socket>((resolve) => {
      const c = net.createConnection({ path: sockPath })
      c.once("connect", () => resolve(c))
    })

    await new Promise((r) => setTimeout(r, 50))

    const received: string[] = []
    client.on("data", (chunk: Buffer) => {
      received.push(chunk.toString())
    })

    server.send({ type: "ping" }, "d-1")

    await new Promise((r) => setTimeout(r, 100))

    const parsed = JSON.parse(received.join("").trim())
    expect(parsed.type).toBe("ping")
    expect(parsed.delegationId).toBe("d-1")

    client.end()
  })

  // ---------------------------------------------------------------------------
  // close()
  // ---------------------------------------------------------------------------

  test("close() removes socket file", async () => {
    const sockPath = tmpSock()
    // No need to push to cleanupPaths — close() should remove it
    const server = await IpcServer.listen(sockPath)
    expect(fs.existsSync(sockPath)).toBe(true)

    server.close()

    expect(fs.existsSync(sockPath)).toBe(false)
  })

  test("send() is a no-op after close()", async () => {
    const sockPath = tmpSock()
    cleanupPaths.push(sockPath)
    const server = await IpcServer.listen(sockPath)

    server.close()

    // Should not throw
    server.send({ type: "cancel" }, "d-1")
  })
})
