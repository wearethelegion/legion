/**
 * Post-Response Extraction Hook (Phase 1.4)
 *
 * Fires asynchronous extraction after each LLM response.
 * Never blocks the main response flow — extraction failures
 * are logged but never interrupt the conversation.
 */

import { isLegionAvailable } from "../legion/auth"
import { Log } from "../util/log"
import { extractTurn, shouldSkipExtraction } from "./extract"
import { ExtractionBuffer } from "./buffer"
import type { TurnExtraction } from "./schema"

const log = Log.create({ service: "extraction.hook" })

export namespace ExtractionHook {
  /**
   * Handle a completed conversation turn.
   * Runs extraction asynchronously via queueMicrotask — never blocks.
   */
  export function onTurnComplete(params: {
    sessionId: string
    turnNumber: number
    userMessage: string
    assistantResponse: string
    recentTopics?: string[]
  }): void {
    // Don't even queue if LEGION is not available
    if (!isLegionAvailable()) return
    if (shouldSkipExtraction(params.userMessage, params.assistantResponse)) {
      log.debug("skipping extraction — skip check", { sessionId: params.sessionId })
      return
    }

    queueMicrotask(async () => {
      try {
        const previousRows = ExtractionBuffer.getSessionExtractions(params.sessionId, 5)
        const previousState = previousRows.map((r) => JSON.parse(r.extraction_json) as TurnExtraction)

        const extraction = await extractTurn(params.userMessage, params.assistantResponse, {
          recentTopics: params.recentTopics,
          sessionId: params.sessionId,
          previousState,
        })

        // extractTurn returns EMPTY_EXTRACTION on error, check if we got anything
        const hasContent =
          extraction.concepts.length > 0 ||
          extraction.decisions.length > 0 ||
          extraction.preferences.length > 0 ||
          extraction.topics.length > 0 ||
          extraction.code_references.length > 0

        if (!hasContent) {
          log.debug("extraction produced no content", { sessionId: params.sessionId, turn: params.turnNumber })
          return
        }

        ExtractionBuffer.insert({
          sessionId: params.sessionId,
          turnNumber: params.turnNumber,
          extraction,
        })

        log.debug("extraction buffered", {
          sessionId: params.sessionId,
          turn: params.turnNumber,
          concepts: extraction.concepts.length,
          decisions: extraction.decisions.length,
        })
      } catch (err) {
        log.error("extraction hook failed", {
          sessionId: params.sessionId,
          turn: params.turnNumber,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  }
}
