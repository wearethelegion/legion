import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"

/**
 * Headless Mode — Structural Verification
 *
 * HeadlessMode.run() requires bootstrap + SDK, making full integration testing
 * impractical without a running server. These tests verify the module's
 * structural contract: exports, interface shape, and key import relationships.
 */
describe("HeadlessMode", () => {
  const headlessPath = path.resolve(__dirname, "../../src/legion/headless.ts")

  test("exports HeadlessMode namespace with run() and Params interface", async () => {
    // Dynamic import to verify runtime exports
    const mod = await import("../../src/legion/headless")
    expect(mod.HeadlessMode).toBeDefined()
    expect(typeof mod.HeadlessMode.run).toBe("function")
  })

  test("HeadlessMode.Params interface has all required fields (source verification)", async () => {
    const content = await fs.readFile(headlessPath, "utf-8")

    // Verify Params interface declares all expected fields
    const expectedFields = [
      "agentId: string",
      "task: string",
      "delegationId: string",
      "engagementId: string",
      "projectId: string",
      "targetPath: string",
      "companyId: string",
      "ipcSock: string",
      "model?: string",
      "context?: string",
      // "mcpConfig?: string",
    ]

    for (const field of expectedFields) {
      expect(content).toContain(field)
    }
  })

  // test("propagates mcpConfig to OPENCODE_MCP_CONFIG_OVERRIDE env var before bootstrap", async () => {
  //   const content = await fs.readFile(headlessPath, "utf-8")
  //   // Must set env var BEFORE bootstrap() so Config.state picks it up on first lazy-init
  //   expect(content).toContain("OPENCODE_MCP_CONFIG_OVERRIDE")
  //   expect(content).toContain("params.mcpConfig")
  //   // Env var must be set prior to the bootstrap() call
  //   const mcpIdx = content.indexOf("OPENCODE_MCP_CONFIG_OVERRIDE")
  //   const bootstrapIdx = content.indexOf("await bootstrap(")
  //   expect(mcpIdx).toBeGreaterThan(0)
  //   expect(bootstrapIdx).toBeGreaterThan(0)
  //   expect(mcpIdx).toBeLessThan(bootstrapIdx)
  // })

  test("imports IpcClient for IPC communication", async () => {
    const content = await fs.readFile(headlessPath, "utf-8")
    expect(content).toContain('import { IpcClient } from "./ipc/client"')
  })

  test("imports ExtractionDrain for flush on shutdown", async () => {
    const content = await fs.readFile(headlessPath, "utf-8")
    expect(content).toContain('import { ExtractionDrain } from "../extraction/drain"')
  })

  test("registers SIGTERM and SIGINT handlers", async () => {
    const content = await fs.readFile(headlessPath, "utf-8")
    expect(content).toContain('process.on("SIGTERM"')
    expect(content).toContain('process.on("SIGINT"')
  })

  test("handles cancel and ping commands from IPC", async () => {
    const content = await fs.readFile(headlessPath, "utf-8")
    expect(content).toContain('cmd.type === "cancel"')
    expect(content).toContain('cmd.type === "ping"')
    expect(content).toContain("emitPong()")
  })

  test("sets LEGION environment variables during bootstrap", async () => {
    const content = await fs.readFile(headlessPath, "utf-8")
    expect(content).toContain("LEGION_ENGAGEMENT_ID")
    expect(content).toContain("LEGION_DELEGATION_ID")
    expect(content).toContain("LEGION_PROJECT_ID")
  })

  test("denies interactive permissions (question, plan_enter, plan_exit)", async () => {
    const content = await fs.readFile(headlessPath, "utf-8")
    expect(content).toContain('"question"')
    expect(content).toContain('"plan_enter"')
    expect(content).toContain('"plan_exit"')
    expect(content).toContain('"deny"')
  })

  test("emits final result with summary, toolsUsed, turns, costUsd, durationMs", async () => {
    const content = await fs.readFile(headlessPath, "utf-8")
    expect(content).toContain("emitResult(")
    expect(content).toContain("summary:")
    expect(content).toContain("toolsUsed:")
    expect(content).toContain("turns")
    expect(content).toContain("costUsd:")
    expect(content).toContain("durationMs:")
  })
})
