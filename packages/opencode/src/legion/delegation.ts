/**
 * LEGION Delegation Tracker (F-028, F-029, F-030)
 *
 * Background monitoring of LEGION delegations via gRPC.
 * Polls for active delegations, tracks status changes, collects results,
 * and surfaces completed delegation results to the LLM via system prompt
 * injection — eliminating the need for get_delegation_status/result tool calls.
 *
 * Lifecycle:
 *   1. LLM calls delegate_to_agent via MCP → delegation spawns (unchanged)
 *   2. DelegationTracker polls gRPC every POLL_INTERVAL_MS for active delegations
 *   3. On completion → fetches full result via getDelegationResult
 *   4. Result queued for injection into next LLM turn (llm.ts reads it)
 *   5. After LLM processes the result, it's marked as delivered
 *
 * Polling is demand-driven: starts on bootstrap (single discovery poll),
 * continues only while active delegations exist, and stops when idle.
 * Calling notify() after spawning a delegation restarts polling if stopped.
 */

import { Log } from "../util/log"
import { getLegionClient, isLegionAvailable } from "./auth"
import { Bus } from "../bus"
import { BusEvent } from "../bus/bus-event"
import z from "zod"
import type { DelegationResultResponse } from "@opencode-ai/legion-client"

const log = Log.create({ service: "legion.delegation" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackedDelegation {
  delegationId: string
  agentName: string
  agentRole: string
  taskSummary: string
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  stepNumber: number
  stepDescription: string
  /** Full result, populated when completed/failed */
  result?: DelegationResult
  /** Whether this result has been injected into the LLM conversation */
  delivered: boolean
  /** Timestamp when we started tracking */
  trackedAt: number
  /** Timestamp of last status change */
  updatedAt: number
}

interface DelegationResult {
  summary: string
  toolsUsed: string[]
  turns: number
  costUsd: number
  error?: string
  completedAt: string
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const tracked = new Map<string, TrackedDelegation>()
let pollTimer: ReturnType<typeof setInterval> | null = null

/** Timestamp of last user activity (LLM stream invocation). Used for idle guard. */
// let lastActivityAt: number = Date.now()

/** How often to poll for delegation status (ms) */
const POLL_INTERVAL_MS = 10_000 // 10 seconds

/** How long to keep delivered results before cleanup (ms) */
const CLEANUP_AFTER_MS = 5 * 60_000 // 5 minutes

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export namespace DelegationTracker {
  /**
   * Bus events published by the DelegationTracker.
   * ResultReady fires when a delegation completes and its result is collected.
   * Subscribers can use this to trigger a new LLM turn on idle sessions.
   */
  // export const Event = {
  //   ResultReady: BusEvent.define(
  //     "legion.delegation.result_ready",
  //     z.object({
  //       delegationId: z.string(),
  //       agentName: z.string(),
  //       status: z.enum(["completed", "failed"]),
  //       summary: z.string(),
  //     }),
  //   ),
  // }

  /**
   * Bootstrap: run a single discovery poll to pick up any pre-existing
   * active delegations. Continuous polling only starts if actives are found.
   */
  export function start() {
    log.info("delegation tracker: initial discovery poll")
    poll()
  }

  /**
   * Notify the tracker that a new delegation was spawned.
   * Ensures continuous polling is running so we catch status changes.
   */
  export function notify() {
    ensurePolling()
  }

  /**
   * Record that user activity occurred (e.g. an LLM stream was initiated).
   * Used by the 2-minute idle guard to determine whether to auto-trigger a turn.
   */
  // export function recordActivity() {
  //   lastActivityAt = Date.now()
  // }

  // /**
  //  * Returns true if no user activity has occurred for at least 2 minutes.
  //  * When true, a completed delegation should auto-trigger a new LLM turn.
  //  */
  // export function isIdle(): boolean {
  //   return Date.now() - lastActivityAt >= 60 * 1000
  // }

  /**
   * Stop background polling. Call during shutdown.
   */
  export function stop() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
      log.info("delegation tracker stopped")
    }
  }

  /**
   * Get count of active (non-terminal) delegations.
   */
  export function getActiveCount(): number {
    let count = 0
    for (const d of tracked.values()) {
      if (d.status === "pending" || d.status === "running") count++
    }
    return count
  }

  /**
   * Get delegation results that haven't been delivered to the LLM yet.
   * Called by llm.ts before each stream to inject into system prompt.
   */
  export function getPendingResults(): TrackedDelegation[] {
    const pending: TrackedDelegation[] = []
    for (const d of tracked.values()) {
      if ((d.status === "completed" || d.status === "failed") && !d.delivered) {
        pending.push(d)
      }
    }
    return pending
  }

  /**
   * Mark delegation results as delivered (injected into LLM conversation).
   * Called by llm.ts after injection.
   */
  export function markDelivered(delegationIds: string[]) {
    for (const id of delegationIds) {
      const d = tracked.get(id)
      if (d) d.delivered = true
    }
  }

  /**
   * Get a formatted status summary for system prompt injection.
   * Returns null if nothing to report.
   */
  export function getSystemPromptSection(): string | null {
    const active: string[] = []
    const results: string[] = []

    for (const d of tracked.values()) {
      if (d.status === "running") {
        active.push(
          `  ⚡ ${d.agentName} (${d.agentRole}): step ${d.stepNumber} — ${d.stepDescription || d.taskSummary}`,
        )
      } else if (d.status === "pending") {
        active.push(`  ⏳ ${d.agentName} (${d.agentRole}): pending — ${d.taskSummary}`)
      } else if ((d.status === "completed" || d.status === "failed") && !d.delivered) {
        if (d.status === "completed" && d.result) {
          results.push(
            [
              `  ✅ ${d.agentName} (${d.agentRole}) — COMPLETED`,
              `     Task: ${d.taskSummary}`,
              `     Result: ${d.result.summary}`,
              `     Cost: $${d.result.costUsd.toFixed(2)} | Turns: ${d.result.turns} | Tools: ${d.result.toolsUsed.join(", ") || "none"}`,
            ].join("\n"),
          )
        } else if (d.status === "failed" && d.result) {
          results.push(
            [
              `  ❌ ${d.agentName} (${d.agentRole}) — FAILED`,
              `     Task: ${d.taskSummary}`,
              `     Error: ${d.result.error || "unknown"}`,
            ].join("\n"),
          )
        }
      }
    }

    if (active.length === 0 && results.length === 0) return null

    const sections: string[] = ["<legion-delegations>"]
    if (results.length > 0) {
      sections.push("DELEGATION RESULTS (new — review and act on these):")
      sections.push(...results)
    }
    if (active.length > 0) {
      sections.push("ACTIVE DELEGATIONS (in progress — no action needed):")
      sections.push(...active)
    }
    sections.push("</legion-delegations>")
    return sections.join("\n")
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Start continuous polling if not already running. */
function ensurePolling() {
  if (pollTimer) return
  log.info("delegation tracker: polling started", { intervalMs: String(POLL_INTERVAL_MS) })
  pollTimer = setInterval(poll, POLL_INTERVAL_MS)
}

/** Stop continuous polling. */
function stopPolling() {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
  log.info("delegation tracker: polling stopped (no active delegations)")
}

/** True when at least one tracked delegation is pending or running. */
function hasActive(): boolean {
  for (const d of tracked.values()) {
    if (d.status === "pending" || d.status === "running") return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Internal polling
// ---------------------------------------------------------------------------

async function poll() {
  if (!isLegionAvailable()) return

  const client = getLegionClient()
  if (!client) return

  try {
    // Fetch all running + pending delegations for discovery
    const [runningResp, pendingResp] = await Promise.all([
      client.listDelegations({ statusFilter: "running", limit: 50 }).catch(() => null),
      client.listDelegations({ statusFilter: "pending", limit: 50 }).catch(() => null),
    ])

    const activeDelegations = [...(runningResp?.delegations ?? []), ...(pendingResp?.delegations ?? [])]

    // Track new delegations we haven't seen
    for (const d of activeDelegations) {
      if (!tracked.has(d.id)) {
        tracked.set(d.id, {
          delegationId: d.id,
          agentName: d.agent_name,
          agentRole: d.agent_role,
          taskSummary: d.task_summary,
          status: d.status as TrackedDelegation["status"],
          stepNumber: d.steps_completed,
          stepDescription: "",
          delivered: false,
          trackedAt: Date.now(),
          updatedAt: Date.now(),
        })
        log.info("tracking new delegation", {
          delegationId: d.id,
          agent: d.agent_name,
          status: d.status,
        })
      } else {
        // Update status for existing tracked delegations
        const existing = tracked.get(d.id)!
        existing.status = d.status as TrackedDelegation["status"]
        existing.stepNumber = d.steps_completed
        existing.updatedAt = Date.now()
      }
    }

    // Check tracked delegations that are no longer in active list
    // (they may have completed or failed)
    for (const [id, d] of tracked) {
      if (d.status === "pending" || d.status === "running") {
        const stillActive = activeDelegations.some((a) => a.id === id)
        if (!stillActive) {
          // Delegation is no longer active — fetch its result
          await fetchResult(id)
        }
      }
    }

    // Cleanup old delivered results
    const now = Date.now()
    for (const [id, d] of tracked) {
      if (d.delivered && now - d.updatedAt > CLEANUP_AFTER_MS) {
        tracked.delete(id)
      }
    }

    // Auto-manage polling: keep running only while there are active delegations
    if (hasActive()) {
      ensurePolling()
    } else {
      stopPolling()
    }
  } catch (err) {
    log.warn("delegation poll failed", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function fetchResult(delegationId: string) {
  const client = getLegionClient()
  if (!client) return

  try {
    const resp: DelegationResultResponse = await client.getDelegationResult(delegationId)

    const d = tracked.get(delegationId)
    if (!d) return

    d.status = (resp.delegation_status as TrackedDelegation["status"]) || "completed"
    d.updatedAt = Date.now()
    d.result = {
      summary: resp.result_summary || "",
      toolsUsed: resp.tools_used || [],
      turns: resp.turns || 0,
      costUsd: resp.cost_usd || 0,
      error: resp.error_detail || undefined,
      completedAt: resp.completed_at || new Date().toISOString(),
    }

    log.info("delegation result collected", {
      delegationId,
      agent: d.agentName,
      status: d.status,
      turns: String(d.result.turns),
      cost: `$${d.result.costUsd.toFixed(2)}`,
    })

    // // Notify subscribers that a result is ready so idle sessions can
    // // process it immediately without waiting for the next user message.
    // Bus.publish(DelegationTracker.Event.ResultReady, {
    //   delegationId,
    //   agentName: d.agentName,
    //   status: d.status as "completed" | "failed",
    //   summary: d.result.summary,
    // })
  } catch (err) {
    log.warn("failed to fetch delegation result", {
      delegationId,
      error: err instanceof Error ? err.message : String(err),
    })
    // Mark as failed so we stop retrying
    const d = tracked.get(delegationId)
    if (d) {
      d.status = "failed"
      d.updatedAt = Date.now()
      d.result = {
        summary: "",
        toolsUsed: [],
        turns: 0,
        costUsd: 0,
        error: `Failed to fetch result: ${err instanceof Error ? err.message : String(err)}`,
        completedAt: new Date().toISOString(),
      }
    }
  }
}
