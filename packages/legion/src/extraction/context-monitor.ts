/**
 * Context Window Monitoring (Phase 3.2)
 *
 * Tracks token usage relative to model context window.
 * Fires warnings when approaching the limit so the session bridge
 * can be built before context is lost.
 *
 * CRITICAL (lesson fd893249): Always include cache tokens in calculation.
 * Claude API returns input_tokens as NEW uncached tokens only.
 * cache_read_input_tokens + cache_creation_input_tokens also consume context.
 */

import { Log } from "../util/log"

const log = Log.create({ service: "extraction.context-monitor" })

export namespace ContextMonitor {
  /** Percentage of context window that triggers a warning. */
  export const CONTEXT_THRESHOLD = 0.80

  export interface ContextUsage {
    total: number
    percentage: number
    threshold: number
    shouldReset: boolean
  }

  /**
   * Calculate context window usage from token counts.
   *
   * CRITICAL: includes cache tokens per lesson fd893249.
   * The `inputTokens` field from Claude API is only the uncached portion.
   * Cache read and creation tokens also occupy context window space.
   */
  export function checkUsage(params: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
    modelContextWindow: number
  }): ContextUsage {
    const total =
      params.inputTokens +
      (params.cacheReadTokens ?? 0) +
      (params.cacheCreationTokens ?? 0) +
      params.outputTokens

    const percentage = params.modelContextWindow > 0
      ? total / params.modelContextWindow
      : 0

    return {
      total,
      percentage,
      threshold: CONTEXT_THRESHOLD,
      shouldReset: percentage >= CONTEXT_THRESHOLD,
    }
  }

  /**
   * Handle context approaching the limit.
   * Logs a warning and could fire a bus event for the session bridge to act on.
   */
  export function onContextApproachingLimit(params: {
    sessionId: string
    usage: ContextUsage
  }): void {
    log.warn("context window approaching limit", {
      sessionId: params.sessionId,
      percentage: Math.round(params.usage.percentage * 100),
      total: params.usage.total,
      threshold: params.usage.threshold,
    })
    // Bus event would go here once bus module is available:
    // Bus.publish("context.approaching_limit", { sessionId: params.sessionId, usage: params.usage })
  }
}
