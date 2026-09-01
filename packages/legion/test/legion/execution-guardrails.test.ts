import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { PermissionNext } from "../../src/permission/next"
import {
  compileToolPolicy,
  costBudgetExceeded,
  normalizeCostBudget,
  resolveContainedPath,
} from "../../src/legion/execution-guardrails"

describe("execution guardrails", () => {
  test("compiles policies as deny-by-default and never asks interactively", () => {
    const rules = compileToolPolicy({
      allow: ["read", "queryKnowledge"],
      rules: [{ permission: "bash", pattern: "git status", action: "ask" }],
    })

    expect(PermissionNext.evaluate("read", "*", rules).action).toBe("allow")
    expect(PermissionNext.evaluate("queryKnowledge", "*", rules).action).toBe("allow")
    expect(PermissionNext.evaluate("write", "*", rules).action).toBe("deny")
    expect(PermissionNext.evaluate("bash", "git status", rules).action).toBe("deny")
    expect(PermissionNext.evaluate("question", "*", rules).action).toBe("deny")
  })

  test("rejects malformed policy rather than silently widening access", () => {
    expect(() => compileToolPolicy({ allow: ["read", 7] })).toThrow("allow entries")
    expect(() => compileToolPolicy({ rules: [{ permission: "read" }] })).toThrow(
      "requires permission, pattern, and action",
    )
  })

  test("enforces finite non-negative cost budgets including zero", () => {
    expect(normalizeCostBudget(undefined)).toBeUndefined()
    expect(normalizeCostBudget(0)).toBe(0)
    expect(costBudgetExceeded(0, 0)).toBe(false)
    expect(costBudgetExceeded(0.0001, 0)).toBe(true)
    expect(costBudgetExceeded(1, 1)).toBe(false)
    expect(() => normalizeCostBudget(-1)).toThrow("non-negative")
    expect(() => normalizeCostBudget(Number.NaN)).toThrow("finite")
  })

  test("contains child workspaces and blocks traversal and symlink escapes", async () => {
    await using root = await tmpdir({
      init: async (directory) => {
        const child = path.join(directory, "child")
        await fs.mkdir(child)
        return child
      },
    })
    await using outside = await tmpdir()
    const link = path.join(root.path, "outside-link")
    await fs.symlink(outside.path, link)

    expect(resolveContainedPath(root.path, root.extra)).toBe(await fs.realpath(root.extra))
    expect(() => resolveContainedPath(root.path, outside.path)).toThrow("escapes")
    expect(() => resolveContainedPath(root.path, link)).toThrow("escapes")
  })

  test("child delegation inherits every immutable parent execution boundary", async () => {
    const source = await fs.readFile(path.resolve(__dirname, "../../src/tool/delegate.ts"), "utf-8")

    expect(source).toContain("LEGION_EXECUTION_ROOT_PATH")
    expect(source).toContain("LEGION_EXECUTION_MODEL")
    expect(source).toContain("LEGION_EXECUTION_MAX_TURNS")
    expect(source).toContain("LEGION_EXECUTION_TIMEOUT_SECONDS")
    expect(source).toContain("LEGION_EXECUTION_COST_BUDGET_USD")
    expect(source).toContain("LEGION_EXECUTION_TOOL_POLICY")
    expect(source).not.toContain("sleep 60")
  })
})
