import path from "path"
import { realpathSync } from "fs"
import type { PermissionNext } from "../permission/next"

type ToolPolicy =
  | { rules?: unknown; allow?: unknown; deny?: unknown }
  | unknown[]
  | undefined

function policyRules(rawPolicy: unknown): unknown[] {
  if (rawPolicy === undefined) return []
  if (Array.isArray(rawPolicy)) return rawPolicy
  if (!rawPolicy || typeof rawPolicy !== "object") {
    throw new Error("The snapshotted tool policy must be an object or rule array")
  }
  const policy = rawPolicy as Exclude<ToolPolicy, unknown[] | undefined>
  if (policy.rules !== undefined && !Array.isArray(policy.rules)) {
    throw new Error("The snapshotted tool policy rules must be an array")
  }
  if (policy.allow !== undefined && !Array.isArray(policy.allow)) {
    throw new Error("The snapshotted tool policy allow list must be an array")
  }
  if (policy.deny !== undefined && !Array.isArray(policy.deny)) {
    throw new Error("The snapshotted tool policy deny list must be an array")
  }
  return policy.rules ?? []
}

/** Compile an immutable, non-interactive, deny-by-default execution policy. */
export function compileToolPolicy(rawPolicy: unknown): PermissionNext.Ruleset {
  const explicit = policyRules(rawPolicy)
  const configured: PermissionNext.Ruleset = explicit.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("Every snapshotted tool policy rule must be an object")
    }
    const rule = candidate as Partial<PermissionNext.Rule>
    if (
      typeof rule.permission !== "string" ||
      !rule.permission.trim() ||
      typeof rule.pattern !== "string" ||
      !rule.pattern.trim() ||
      !["allow", "deny", "ask"].includes(String(rule.action))
    ) {
      throw new Error("Every snapshotted tool policy rule requires permission, pattern, and action")
    }
    return {
      permission: rule.permission.trim(),
      pattern: rule.pattern.trim(),
      // Headless execution cannot pause for an interactive permission prompt.
      action: rule.action === "allow" ? "allow" : "deny",
    }
  })

  if (!Array.isArray(rawPolicy) && rawPolicy && typeof rawPolicy === "object") {
    const policy = rawPolicy as Exclude<ToolPolicy, unknown[] | undefined>
    for (const permission of Array.isArray(policy.allow) ? policy.allow : []) {
      if (typeof permission !== "string" || !permission.trim()) {
        throw new Error("Tool policy allow entries must be non-empty strings")
      }
      configured.push({ permission: permission.trim(), pattern: "*", action: "allow" })
    }
    for (const permission of Array.isArray(policy.deny) ? policy.deny : []) {
      if (typeof permission !== "string" || !permission.trim()) {
        throw new Error("Tool policy deny entries must be non-empty strings")
      }
      configured.push({ permission: permission.trim(), pattern: "*", action: "deny" })
    }
  }

  return [
    { permission: "*", action: "deny", pattern: "*" },
    ...configured,
    { permission: "question", action: "deny", pattern: "*" },
    { permission: "plan_enter", action: "deny", pattern: "*" },
    { permission: "plan_exit", action: "deny", pattern: "*" },
  ]
}

export function normalizeCostBudget(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("The execution cost budget must be a finite non-negative number")
  }
  return value
}

export function costBudgetExceeded(totalCost: number, budget: number | undefined): boolean {
  return budget !== undefined && totalCost > budget + Number.EPSILON
}

/** Resolve an existing child workspace while preventing `..` and symlink escapes. */
export function resolveContainedPath(root: string, requested: string): string {
  const canonicalRoot = realpathSync(path.resolve(root))
  const canonicalTarget = realpathSync(path.resolve(requested))
  const relative = path.relative(canonicalRoot, canonicalTarget)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Delegation target path escapes the approved workspace root: ${canonicalTarget}`)
  }
  return canonicalTarget
}
