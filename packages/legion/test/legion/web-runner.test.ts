import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"

describe("WebDelegationRunner", () => {
  const runnerPath = path.resolve(__dirname, "../../src/legion/web-runner.ts")

  test("exports a controllable background runner", async () => {
    const mod = await import("../../src/legion/web-runner")
    expect(typeof mod.WebDelegationRunner.start).toBe("function")
    expect(typeof mod.WebDelegationRunner.stop).toBe("function")
    expect(typeof mod.WebDelegationRunner.isEnabled).toBe("function")
    mod.WebDelegationRunner.stop()
  })

  test("requires an explicit coordinated rollout flag", async () => {
    const { WebDelegationRunner } = await import("../../src/legion/web-runner")
    expect(WebDelegationRunner.isEnabled({})).toBe(false)
    expect(WebDelegationRunner.isEnabled({ LEGION_AGENT_WORKSPACE_ENABLED: "false" })).toBe(false)
    expect(WebDelegationRunner.isEnabled({ LEGION_AGENT_WORKSPACE_ENABLED: "true" })).toBe(true)
    expect(WebDelegationRunner.isEnabled({ LEGION_AGENT_WORKSPACE_ENABLED: "1" })).toBe(true)
  })

  test("advertises explicit runner scheduling and sovereignty capabilities", async () => {
    const { WebDelegationRunner } = await import("../../src/legion/web-runner")
    expect(WebDelegationRunner.capabilities({})).toEqual({
      runtimes: ["legion-cli"],
      providers: [],
      models: [],
      runnerPools: ["default"],
      dataResidencies: [],
      local: false,
      networkIsolated: false,
    })
    expect(
      WebDelegationRunner.capabilities({
        LEGION_RUNNER_PROVIDERS: "ollama, ollama",
        LEGION_RUNNER_MODELS: "llama3.3:70b",
        LEGION_RUNNER_POOLS: "sovereign-ua",
        LEGION_RUNNER_RESIDENCIES: "ua",
        LEGION_RUNNER_LOCAL: "true",
        LEGION_RUNNER_NETWORK_ISOLATED: "1",
      }),
    ).toEqual({
      runtimes: ["legion-cli"],
      providers: ["ollama"],
      models: ["llama3.3:70b"],
      runnerPools: ["sovereign-ua"],
      dataResidencies: ["ua"],
      local: true,
      networkIsolated: true,
    })
  })

  test("claims authenticated project work with bounded local execution", async () => {
    const content = await fs.readFile(runnerPath, "utf-8")
    expect(content).toContain("claimPendingDelegation")
    expect(content).toContain('runtimes: ["legion-cli"]')
    expect(content).toContain("LEGION_RUNNER_POOLS")
    expect(content).toContain("LEGION_RUNNER_RESIDENCIES")
    expect(content).toContain("LEGION_RUNNER_MODELS")
    expect(content).toContain("LEGION_RUNNER_CONCURRENCY")
    expect(content).toContain("LEGION_PROJECT_PATHS")
    expect(content).toContain('"--owner_id"')
    expect(content).toContain('"--run_id"')
    expect(content).toContain('"--max_turns"')
    expect(content).toContain('"--timeout_seconds"')
    expect(content).toContain('args.push("--tool_policy"')
    expect(content).toContain('args.push("--cost_budget_usd"')
    expect(content).toContain('args.push("--request_kind"')
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
