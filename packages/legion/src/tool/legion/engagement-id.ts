/**
 * Module-level engagement ID store for the tool guard.
 *
 * Mutation tools must provide engagement_id in their args.
 * The wrapper in tool.ts stores the latest value here so that
 * LEGION gRPC calls can also attach it for traceability.
 *
 * Separate module to avoid circular imports (tool.ts ↔ legion/).
 */

let _engagementId: string | null = null

/** Called by tool.ts wrapper when a mutation tool provides engagement_id. */
export function setEngagementId(id: string) {
  _engagementId = id
}

/** Read by LEGION client or other subsystems that need the active engagement. */
export function getEngagementId(): string | null {
  return _engagementId
}
