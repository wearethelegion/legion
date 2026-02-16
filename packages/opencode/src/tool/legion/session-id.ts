/**
 * Module-level session ID store for LEGION gRPC calls.
 *
 * Set by tool.ts wrapper before every execute().
 * Read by client() in index.ts to inject x-session-id header.
 *
 * Separate module to avoid circular imports (tool.ts ↔ legion/index.ts).
 */

let _sessionId: string | null = null

/** Called by tool.ts wrapper to propagate the opencode session ID. */
export function setSessionId(id: string) {
  _sessionId = id
}

/** Read by client() to get the current session ID. */
export function getSessionId(): string | null {
  return _sessionId
}
