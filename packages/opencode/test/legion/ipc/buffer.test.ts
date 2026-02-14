import { describe, expect, test } from "bun:test"
import { JsonlParser } from "../../../src/legion/ipc/buffer"

const encoder = new TextEncoder()

/** Build a valid IPC message with required fields */
function msg(type: string, delegationId: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ type, delegationId, ts: Date.now(), ...extra })
}

/** Encode a string to a Uint8Array suitable for feed() */
function encode(s: string): Uint8Array {
  return encoder.encode(s)
}

describe("JsonlParser", () => {
  // ---------------------------------------------------------------------------
  // Basic parsing
  // ---------------------------------------------------------------------------

  test("parses a single complete JSON line", () => {
    const parser = new JsonlParser()
    const line = msg("status", "d-1", { status: "running" })
    const results = parser.feed(encode(line + "\n"))
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe("status")
    expect(results[0].delegationId).toBe("d-1")
  })

  test("parses multiple JSON lines in a single chunk", () => {
    const parser = new JsonlParser()
    const lines = [
      msg("status", "d-1", { status: "running" }),
      msg("action", "d-1", { action: "doing stuff" }),
      msg("error", "d-1", { error: "oops", recoverable: true }),
    ]
    const results = parser.feed(encode(lines.join("\n") + "\n"))
    expect(results).toHaveLength(3)
    expect(results[0].type).toBe("status")
    expect(results[1].type).toBe("action")
    expect(results[2].type).toBe("error")
  })

  // ---------------------------------------------------------------------------
  // Fragmentation handling (critical for TCP streams)
  // ---------------------------------------------------------------------------

  test("reassembles a single message split across two feed() calls", () => {
    const parser = new JsonlParser()
    const line = msg("status", "d-1", { status: "initializing" })
    const half = Math.floor(line.length / 2)

    // First chunk: partial message (no newline)
    const r1 = parser.feed(encode(line.slice(0, half)))
    expect(r1).toHaveLength(0)

    // Second chunk: rest of message + newline
    const r2 = parser.feed(encode(line.slice(half) + "\n"))
    expect(r2).toHaveLength(1)
    expect(r2[0].type).toBe("status")
    expect(r2[0].delegationId).toBe("d-1")
  })

  test("handles message split across three feed() calls", () => {
    const parser = new JsonlParser()
    const line = msg("action", "d-2", { action: "reading file" })
    const third = Math.floor(line.length / 3)

    expect(parser.feed(encode(line.slice(0, third)))).toHaveLength(0)
    expect(parser.feed(encode(line.slice(third, third * 2)))).toHaveLength(0)
    const results = parser.feed(encode(line.slice(third * 2) + "\n"))
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe("action")
  })

  test("first chunk has complete line + partial, second chunk completes it", () => {
    const parser = new JsonlParser()
    const line1 = msg("status", "d-1", { status: "running" })
    const line2 = msg("error", "d-1", { error: "fail", recoverable: false })
    const half2 = Math.floor(line2.length / 2)

    // Complete first + partial second
    const r1 = parser.feed(encode(line1 + "\n" + line2.slice(0, half2)))
    expect(r1).toHaveLength(1)
    expect(r1[0].type).toBe("status")

    // Complete second
    const r2 = parser.feed(encode(line2.slice(half2) + "\n"))
    expect(r2).toHaveLength(1)
    expect(r2[0].type).toBe("error")
  })

  // ---------------------------------------------------------------------------
  // Invalid input handling
  // ---------------------------------------------------------------------------

  test("skips invalid JSON lines and continues parsing", () => {
    const parser = new JsonlParser()
    const valid = msg("status", "d-1", { status: "running" })
    const data = `not-json\n${valid}\n`
    const results = parser.feed(encode(data))
    // Invalid line skipped, valid line parsed
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe("status")
  })

  test("skips messages missing required 'type' field", () => {
    const parser = new JsonlParser()
    const noType = JSON.stringify({ delegationId: "d-1", ts: 123 })
    const valid = msg("status", "d-1", { status: "running" })
    const results = parser.feed(encode(noType + "\n" + valid + "\n"))
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe("status")
  })

  test("skips messages missing required 'delegationId' field", () => {
    const parser = new JsonlParser()
    const noDelId = JSON.stringify({ type: "status", ts: 123 })
    const valid = msg("action", "d-1", { action: "test" })
    const results = parser.feed(encode(noDelId + "\n" + valid + "\n"))
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe("action")
  })

  test("skips messages missing both required fields", () => {
    const parser = new JsonlParser()
    const noFields = JSON.stringify({ foo: "bar" })
    const results = parser.feed(encode(noFields + "\n"))
    expect(results).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Oversized messages
  // ---------------------------------------------------------------------------

  test("skips messages exceeding 64KB", () => {
    const parser = new JsonlParser()
    // Build a message whose JSON line is >64KB
    const bigPayload = "x".repeat(70_000)
    const oversized = JSON.stringify({ type: "result", delegationId: "d-1", data: bigPayload })
    const valid = msg("status", "d-1", { status: "completed" })
    const results = parser.feed(encode(oversized + "\n" + valid + "\n"))
    // Oversized skipped, valid parsed
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe("status")
  })

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  test("handles empty chunks gracefully", () => {
    const parser = new JsonlParser()
    const results = parser.feed(encode(""))
    expect(results).toHaveLength(0)
  })

  test("handles chunk with only newlines", () => {
    const parser = new JsonlParser()
    const results = parser.feed(encode("\n\n\n"))
    expect(results).toHaveLength(0)
  })

  test("handles chunk with only whitespace lines", () => {
    const parser = new JsonlParser()
    const results = parser.feed(encode("   \n  \n"))
    expect(results).toHaveLength(0)
  })

  test("sequential messages across many feed() calls", () => {
    const parser = new JsonlParser()
    for (let i = 0; i < 50; i++) {
      const line = msg("status", `d-${i}`, { status: "running" })
      const results = parser.feed(encode(line + "\n"))
      expect(results).toHaveLength(1)
      expect(results[0].delegationId).toBe(`d-${i}`)
    }
  })

  test("preserves all fields from valid messages", () => {
    const parser = new JsonlParser()
    const line = msg("tokens", "d-42", {
      turn: 3,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      turnCostUsd: 0.01,
      totalCostUsd: 0.05,
    })
    const results = parser.feed(encode(line + "\n"))
    expect(results).toHaveLength(1)
    const m = results[0] as any
    expect(m.type).toBe("tokens")
    expect(m.delegationId).toBe("d-42")
    expect(m.turn).toBe(3)
    expect(m.inputTokens).toBe(100)
    expect(m.outputTokens).toBe(50)
    expect(m.turnCostUsd).toBe(0.01)
    expect(m.totalCostUsd).toBe(0.05)
  })
})
