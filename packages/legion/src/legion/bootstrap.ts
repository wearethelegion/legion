/**
 * LEGION whoAmI Bootstrap Sequence (F-005)
 *
 * After authentication, calls whoAmI to retrieve the agent's full identity:
 * name, role, personality, system_prompt, capabilities, skills, available agents,
 * permanent memories, workflows, and project instructions.
 */

import type { WhoAmIResponse } from "@wearethelegion/legion-client"
import { getLegionClient } from "./auth"
import { Log } from "../util/log"

const log = Log.create({ service: "legion.bootstrap" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LegionIdentity {
  /** Raw whoAmI response data */
  raw: WhoAmIResponse
  /** When this identity was fetched */
  fetchedAt: string
  /** Whether this identity was loaded from cache (stale) */
  stale: boolean
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let cachedIdentity: LegionIdentity | null = null

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BootstrapOptions {
  agentId?: string
  companyId?: string
  projectId?: string
  /** Base directory for cache file (defaults to cwd) - unused, kept for API compat */
  cacheDir?: string
}

/**
 * Run the full LEGION bootstrap sequence:
 * 1. Call whoAmI via the authenticated client
 * 2. Parse the response
 *
 * Returns the identity or null if live fails.
 */
export async function bootstrapLegion(opts: BootstrapOptions = {}): Promise<LegionIdentity | null> {
  const client = getLegionClient()
  if (!client) {
    log.info("LEGION client not available")
    return null
  }

  try {
    log.debug("calling whoAmI", {
      agentId: opts.agentId ?? "(default)",
      projectId: opts.projectId ?? "(none)",
    })

    const response = await client.whoAmI({
      agentId: opts.agentId,
      companyId: opts.companyId,
      projectId: opts.projectId,
    })

    if (response.error_message) {
      log.warn("whoAmI returned error", {
        error: response.error_message,
        code: response.error_code,
      })
      return null
    }

    const identity: LegionIdentity = {
      raw: response,
      fetchedAt: new Date().toISOString(),
      stale: false,
    }

    cachedIdentity = identity

    log.info("LEGION identity loaded", {
      name: response.name,
      role: response.role,
      skills: String(response.skills_count),
      agents: String(response.available_agents_count),
    })

    return identity
  } catch (err) {
    log.warn("whoAmI failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Get the current LEGION identity.
 * Returns null if bootstrap hasn't run or failed.
 */
export function getLegionIdentity(): LegionIdentity | null {
  return cachedIdentity
}

/**
 * Clear the in-memory identity.
 */
export function clearLegionIdentity(): void {
  cachedIdentity = null
}
