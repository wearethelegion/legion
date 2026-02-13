/**
 * LEGION Authentication & Token Management (F-003)
 *
 * Manages the LegionClient singleton: authenticates on startup,
 * caches the authenticated client, and provides graceful fallback
 * when LEGION is not configured or unreachable.
 */

import { LegionClient, LegionConnectionError } from "@opencode-ai/legion-client"
import { Log } from "../util/log"

const log = Log.create({ service: "legion.auth" })

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let clientInstance: LegionClient | null = null
let authPromise: Promise<LegionClient | null> | null = null

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

interface LegionConnectionConfig {
  host: string
  port: number
  apiKey?: string
  email?: string
  password?: string
}

/**
 * Resolve connection config from OpenCode config + env vars.
 * Returns null if LEGION is not configured at all.
 */
function resolveConnectionConfig(
  legionConfig?: { serverUrl?: string; email?: string; password?: string },
): LegionConnectionConfig | null {
  const host =
    process.env.GRPC_SERVER_HOST ??
    extractHost(legionConfig?.serverUrl) ??
    undefined
  const port =
    parseInt(process.env.GRPC_SERVER_PORT ?? "", 10) ||
    extractPort(legionConfig?.serverUrl) ||
    undefined

  const apiKey = process.env.LEGION_API_KEY ?? undefined
  const email = legionConfig?.email ?? process.env.MCP_USER_EMAIL ?? undefined
  const password = legionConfig?.password ?? process.env.MCP_USER_PASSWORD ?? undefined

  // Need at least credentials to be useful
  const hasCredentials = !!(apiKey || (email && password))
  if (!hasCredentials) {
    return null
  }

  return {
    host: host ?? "localhost",
    port: port ?? 50051,
    apiKey,
    email,
    password,
  }
}

function extractHost(serverUrl?: string): string | undefined {
  if (!serverUrl) return undefined
  try {
    // Handle "host:port" format (no protocol)
    const parts = serverUrl.split(":")
    return parts[0] || undefined
  } catch {
    return undefined
  }
}

function extractPort(serverUrl?: string): number | undefined {
  if (!serverUrl) return undefined
  try {
    const parts = serverUrl.split(":")
    if (parts.length >= 2) {
      const port = parseInt(parts[parts.length - 1], 10)
      return isNaN(port) ? undefined : port
    }
  } catch {
    // ignore
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Authenticate with LEGION and return the client singleton.
 *
 * - First call creates and authenticates the client.
 * - Subsequent calls return the cached instance.
 * - If LEGION is not configured, returns null immediately.
 * - If authentication fails, logs warning and returns null (graceful degradation).
 */
export async function authenticateLegion(
  legionConfig?: { serverUrl?: string; email?: string; password?: string },
): Promise<LegionClient | null> {
  // Already have a client
  if (clientInstance) return clientInstance

  // Deduplicate concurrent calls
  if (authPromise) return authPromise

  authPromise = _doAuthenticate(legionConfig)
  try {
    return await authPromise
  } finally {
    authPromise = null
  }
}

async function _doAuthenticate(
  legionConfig?: { serverUrl?: string; email?: string; password?: string },
): Promise<LegionClient | null> {
  const connConfig = resolveConnectionConfig(legionConfig)
  if (!connConfig) {
    log.info("LEGION not configured — skipping authentication")
    return null
  }

  log.info("authenticating with LEGION", {
    host: connConfig.host,
    port: String(connConfig.port),
    method: connConfig.apiKey ? "api_key" : "email/password",
  })

  const client = new LegionClient({
    host: connConfig.host,
    port: connConfig.port,
    apiKey: connConfig.apiKey,
    email: connConfig.email,
    password: connConfig.password,
  })

  try {
    await client.authenticate()
    log.info("LEGION authenticated", { email: client.userEmail ?? "unknown" })
    clientInstance = client
    return client
  } catch (err) {
    if (err instanceof LegionConnectionError) {
      log.warn("LEGION server unreachable — continuing without LEGION", {
        host: connConfig.host,
        port: String(connConfig.port),
      })
    } else {
      log.warn("LEGION authentication failed — continuing without LEGION", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    // Clean up the failed client
    try {
      client.close()
    } catch {
      // ignore
    }
    return null
  }
}

/**
 * Get the authenticated LegionClient singleton.
 * Returns null if LEGION is not configured or authentication failed.
 * Does NOT trigger authentication — call `authenticateLegion()` first.
 */
export function getLegionClient(): LegionClient | null {
  return clientInstance
}

/**
 * Check if LEGION is available (authenticated and ready).
 */
export function isLegionAvailable(): boolean {
  return clientInstance !== null
}

/**
 * Close the LEGION client and clear singleton state.
 * Call during shutdown or when reconfiguring.
 */
export function closeLegionClient(): void {
  if (clientInstance) {
    try {
      clientInstance.close()
    } catch {
      // ignore close errors
    }
    clientInstance = null
  }
}
