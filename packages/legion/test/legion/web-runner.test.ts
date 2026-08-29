import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"

describe("WebDelegationRunner", () => {
  const runnerPath = path.resolve(__dirname, "../../src/legion/web-runner.ts")

  test("exports a controllable background runner", async () => {
    const mod = await import("../../src/legion/web-runner")
    expect(typeof mod.WebDelegationRunner.start).toBe("function")
    expect(typeof mod.WebDelegationRunner.stop).toBe("function")
    mod.WebDelegationRunner.stop()
  })

  test("claims authenticated project work with bounded local execution", async () => {
    const content = await fs.readFile(runnerPath, "utf-8")
    expect(content).toContain("claimPendingDelegation")
    expect(content).toContain('runtimes: ["legion-cli"]')
    expect(content).toContain("LEGION_RUNNER_CONCURRENCY")
    expect(content).toContain("LEGION_PROJECT_PATHS")
    expect(content).toContain('"--owner_id"')
    expect(content).toContain('"--run_id"')
    expect(content).toContain('"--max_turns"')
    expect(content).toContain('"--timeout_seconds"')
    expect(content).toContain('args.push("--tool_policy"')
  })

  test("uses hidden cross-platform process options and reconciles hard exits", async () => {
    const content = await fs.readFile(runnerPath, "utf-8")
    expect(content).toContain("delegationProcessOptions()")
    expect(content).toContain("getDelegationStatusBrief")
    expect(content).toContain("failClaimedJob")
    expect(content).toContain("closeSync(stderrFd)")
    expect(content).toContain("LEGION_DELEGATION_ID: job.delegation_id")
    expect(content).toContain("LEGION_AGENT_RUN_ID: job.run_id")
    expect(content).toContain('LEGION_DELEGATION_DEPTH: "0"')
  })
})
