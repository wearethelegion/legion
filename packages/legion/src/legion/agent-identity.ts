/**
 * LEGION Agent Identity Injection (F-006)
 *
 * Maps LEGION agent identity (from whoAmI) to Legion's agent format.
 * Generates an agent config that Legion's agent system understands,
 * injecting the combined system prompt as the agent's prompt.
 */

import type { WhoAmIResponse, AvailableAgent } from "@wearethelegion/legion-client"
import { getLegionIdentity, type LegionIdentity } from "./bootstrap"
import { Log } from "../util/log"

const log = Log.create({ service: "legion.agent-identity" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Legion-compatible agent configuration generated from LEGION identity.
 * Matches the shape expected by Legion's agent system (Agent.Info fields).
 */
export interface LegionAgentConfig {
  /** Agent name from LEGION (e.g. "Tommy") */
  name: string
  /** Agent description from LEGION main_responsibilities */
  description: string
  /** The combined system prompt (company + project + agent instructions) */
  prompt: string
  /** Agent role from LEGION (e.g. "developer", "architect") */
  role: string
  /** Agent capabilities from LEGION */
  capabilities: string[]
  /** LEGION agent UUID */
  agentId: string
  /** Whether this identity came from a stale cache */
  stale: boolean
  /** Tool permission hints based on agent role (for future Tier 2b filtering) */
  toolPermissions: ToolPermissionHints
}

/**
 * Tool permission hints based on LEGION agent role.
 * These are advisory — actual enforcement happens in Tier 2b (future).
 */
export interface ToolPermissionHints {
  /** Tools the agent should always have access to */
  allowed: string[]
  /** Tools the agent should never use */
  denied: string[]
  /** Agent's role-based permission level */
  level: "full" | "read-only" | "restricted"
}

// ---------------------------------------------------------------------------
// Role → Permission mapping
// ---------------------------------------------------------------------------

function roleToPermissions(role: string): ToolPermissionHints {
  switch (role.toLowerCase()) {
    case "developer":
      return {
        allowed: ["read", "write", "edit", "bash", "grep", "glob"],
        denied: [],
        level: "full",
      }
    case "architect":
      return {
        allowed: ["read", "grep", "glob", "bash"],
        denied: ["write", "edit"],
        level: "read-only",
      }
    case "researcher":
      return {
        allowed: ["read", "grep", "glob", "webfetch", "websearch"],
        denied: ["write", "edit", "bash"],
        level: "read-only",
      }
    case "protector":
      return {
        allowed: ["read", "grep", "glob"],
        denied: ["write", "edit"],
        level: "read-only",
      }
    case "orchestrator":
      return {
        allowed: ["read", "grep", "glob"],
        denied: [],
        level: "restricted",
      }
    default:
      return {
        allowed: ["read", "grep", "glob"],
        denied: [],
        level: "restricted",
      }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an Legion-compatible agent config from LEGION identity.
 * Returns null if no identity is available.
 */
export function getLegionAgent(): LegionAgentConfig | null {
  const identity = getLegionIdentity()
  if (!identity) {
    log.info("no LEGION identity available — cannot generate agent config")
    return null
  }

  return buildAgentConfig(identity)
}

/**
 * Build agent config from a specific identity (for testing or direct use).
 */
export function buildAgentConfig(identity: LegionIdentity): LegionAgentConfig {
  const raw = identity.raw

  const config: LegionAgentConfig = {
    name: raw.name || "LEGION Agent",
    description: raw.main_responsibilities || `LEGION ${raw.role} agent`,
    prompt: raw.system_prompt || "",
    role: raw.role || "developer",
    capabilities: raw.capabilities ?? [],
    agentId: raw.agent_id,
    stale: identity.stale,
    toolPermissions: roleToPermissions(raw.role),
  }

  if (identity.stale) {
    log.warn("agent config built from stale cached identity", {
      name: config.name,
      fetchedAt: identity.fetchedAt,
    })
  }

  return config
}

/**
 * Get available delegate agents from LEGION identity.
 * Returns the list of specialist agents that can receive delegated tasks.
 */
export function getAvailableAgents(): Array<{
  agentId: string
  name: string
  role: string
  specialization: string
}> {
  const identity = getLegionIdentity()
  if (!identity) return []

  return (identity.raw.available_agents ?? []).map((a: AvailableAgent) => ({
    agentId: a.agent_id,
    name: a.name,
    role: a.role,
    specialization: a.specialization,
  }))
}
