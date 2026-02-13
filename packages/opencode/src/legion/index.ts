/**
 * LEGION Integration Layer — Barrel exports + initialization orchestrator.
 *
 * This is the single entry point for LEGION integration in OpenCode.
 * Call `initializeLegion()` during startup to authenticate, bootstrap
 * identity, and load project context — all before the first user message.
 */

import { Log } from "../util/log"

// Re-export public APIs
export { authenticateLegion, getLegionClient, isLegionAvailable, closeLegionClient } from "./auth"
export { bootstrapLegion, getLegionIdentity, clearLegionIdentity } from "./bootstrap"
export type { LegionIdentity } from "./bootstrap"
export { getLegionAgent, buildAgentConfig, getAvailableAgents } from "./agent-identity"
export type { LegionAgentConfig, ToolPermissionHints } from "./agent-identity"
export { loadProjectContext, getProjectContext, getProjectInstructions, clearProjectContext } from "./project-context"

const log = Log.create({ service: "legion" })

// ---------------------------------------------------------------------------
// Config type (matches the Zod schema in config.ts)
// ---------------------------------------------------------------------------

export interface LegionConfig {
  serverUrl?: string
  companyId?: string
  email?: string
  password?: string
}

// ---------------------------------------------------------------------------
// Initialization result
// ---------------------------------------------------------------------------

export interface LegionInitResult {
  /** Whether LEGION is active and ready */
  available: boolean
  /** Agent name (null if not available) */
  agentName: string | null
  /** Agent role (null if not available) */
  agentRole: string | null
  /** Whether identity came from stale cache */
  stale: boolean
  /** Errors encountered (non-fatal) */
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Main initialization orchestrator
// ---------------------------------------------------------------------------

/**
 * Initialize the full LEGION integration layer.
 *
 * Sequence:
 * 1. Authenticate with LEGION gRPC server
 * 2. Call whoAmI to bootstrap agent identity
 * 3. Load agent identity into OpenCode-compatible format
 * 4. Load project context
 * 5. Cache everything for offline mode
 *
 * Graceful degradation: if any step fails, subsequent steps are skipped
 * and OpenCode continues without LEGION.
 */
export async function initializeLegion(config?: LegionConfig): Promise<LegionInitResult> {
  const { authenticateLegion } = await import("./auth")
  const { bootstrapLegion } = await import("./bootstrap")
  const { getLegionAgent } = await import("./agent-identity")

  const warnings: string[] = []
  const result: LegionInitResult = {
    available: false,
    agentName: null,
    agentRole: null,
    stale: false,
    warnings,
  }

  log.info("initializing LEGION integration")

  // Step 1: Authenticate (credentials from env vars)
  const client = await authenticateLegion(config)
  if (!client) {
    log.info("LEGION not available — OpenCode will run without LEGION")
    return result
  }

  // Step 2: Bootstrap identity (whoAmI)
  const identity = await bootstrapLegion({
    companyId: config?.companyId,
  })

  if (!identity) {
    warnings.push("whoAmI failed and no cached identity available")
    log.warn("LEGION auth succeeded but identity bootstrap failed")
    result.available = true
    return result
  }

  if (identity.stale) {
    warnings.push(`Using stale cached identity from ${identity.fetchedAt}`)
  }

  // Step 3: Build agent identity
  const agent = getLegionAgent()
  if (agent) {
    result.agentName = agent.name
    result.agentRole = agent.role
    result.stale = agent.stale
  }

  result.available = true

  log.info("LEGION initialization complete", {
    agent: result.agentName ?? "unknown",
    role: result.agentRole ?? "unknown",
    stale: String(result.stale),
    warnings: String(warnings.length),
  })

  return result
}
