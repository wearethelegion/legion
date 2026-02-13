/**
 * LEGION whoAmI Bootstrap Sequence (F-005)
 *
 * After authentication, calls whoAmI to retrieve the agent's full identity:
 * name, role, personality, system_prompt, capabilities, skills, available agents,
 * permanent memories, workflows, and project instructions.
 *
 * Caches identity to `.opencode/cache/legion-identity.json` for offline fallback.
 */

import type { WhoAmIResponse } from "@opencode-ai/legion-client"
import { getLegionClient } from "./auth"
import { Log } from "../util/log"
import fs from "fs/promises"
import path from "path"

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
// Cache paths
// ---------------------------------------------------------------------------

const CACHE_DIR = path.join(".opencode", "cache")
const CACHE_FILE = path.join(CACHE_DIR, "legion-identity.json")

/**
 * Resolve cache file path relative to a base directory.
 * If baseDir is not provided, uses cwd.
 */
function cachePath(baseDir?: string): string {
  return path.resolve(baseDir ?? process.cwd(), CACHE_FILE)
}

// ---------------------------------------------------------------------------
// Cache I/O
// ---------------------------------------------------------------------------

async function writeCache(identity: LegionIdentity, baseDir?: string): Promise<void> {
  const filePath = cachePath(baseDir)
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(identity, null, 2), "utf-8")
    log.info("cached LEGION identity", { path: filePath })
  } catch (err) {
    log.warn("failed to cache LEGION identity", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function readCache(baseDir?: string): Promise<LegionIdentity | null> {
  const filePath = cachePath(baseDir)
  try {
    const text = await fs.readFile(filePath, "utf-8")
    const data = JSON.parse(text) as LegionIdentity
    // Mark as stale since it's from cache
    return { ...data, stale: true }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BootstrapOptions {
  agentId?: string
  companyId?: string
  projectId?: string
  /** Base directory for cache file (defaults to cwd) */
  cacheDir?: string
}

/**
 * Run the full LEGION bootstrap sequence:
 * 1. Call whoAmI via the authenticated client
 * 2. Parse and cache the response
 * 3. Fall back to cached identity if whoAmI fails
 *
 * Returns the identity or null if both live + cached fail.
 */
export async function bootstrapLegion(opts: BootstrapOptions = {}): Promise<LegionIdentity | null> {
  const client = getLegionClient()
  if (!client) {
    log.info("LEGION client not available — attempting cached identity")
    return _loadCachedFallback(opts.cacheDir)
  }

  try {
    log.info("calling whoAmI", {
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
      return _loadCachedFallback(opts.cacheDir)
    }

    const identity: LegionIdentity = {
      raw: response,
      fetchedAt: new Date().toISOString(),
      stale: false,
    }

    // Cache for offline mode (fire-and-forget)
    writeCache(identity, opts.cacheDir).catch(() => {})

    cachedIdentity = identity

    log.info("LEGION identity loaded", {
      name: response.name,
      role: response.role,
      skills: String(response.skills_count),
      agents: String(response.available_agents_count),
    })

    return identity
  } catch (err) {
    log.warn("whoAmI failed — falling back to cached identity", {
      error: err instanceof Error ? err.message : String(err),
    })
    return _loadCachedFallback(opts.cacheDir)
  }
}

async function _loadCachedFallback(cacheDir?: string): Promise<LegionIdentity | null> {
  const cached = await readCache(cacheDir)
  if (cached) {
    log.warn("using STALE cached LEGION identity", { fetchedAt: cached.fetchedAt })
    cachedIdentity = cached
    return cached
  }
  log.info("no cached LEGION identity found")
  return null
}

/**
 * Get the current LEGION identity (from bootstrap or cache).
 * Returns null if bootstrap hasn't run or failed.
 */
export function getLegionIdentity(): LegionIdentity | null {
  return cachedIdentity
}

/**
 * Clear the in-memory identity. Does NOT delete the cache file.
 */
export function clearLegionIdentity(): void {
  cachedIdentity = null
}
