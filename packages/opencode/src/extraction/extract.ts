/**
 * Haiku Extraction Call
 *
 * Uses the AI SDK's generateObject through opencode's Provider system,
 * which handles OAuth, API keys, and token refresh via the anthropic-auth
 * plugin. Never throws — returns EMPTY_EXTRACTION on any error.
 */

import { generateObject, APICallError } from "ai"
import { TurnExtraction } from "./schema"
import { buildExtractionPromptWithState } from "./prompt"
import { Provider } from "../provider/provider"
import { Log } from "../util/log"

const log = Log.create({ service: "extraction" })

const EXTRACTION_MODEL_ID = "claude-haiku-4-5-20251001"
const EXTRACTION_PROVIDER_ID = "anthropic"

/**
 * Safe empty extraction returned on any error or skip condition.
 */
export const EMPTY_EXTRACTION: TurnExtraction = {
  concepts: [],
  decisions: [],
  preferences: [],
  topics: [],
  code_references: [],
  intent: "exploration",
  urgency: "normal",
}

/**
 * Check if a turn should be skipped for extraction.
 *
 * Skips:
 * - Both messages combined < 40 chars
 * - Message is only tool invocations (no substantive text)
 * - Message is a system/control message
 */
export function shouldSkipExtraction(userMessage: string, assistantResponse: string): boolean {
  const combined = (userMessage + assistantResponse).trim()

  // Too short to contain anything meaningful
  if (combined.length < 40) return true

  // Only tool invocations — no substantive text
  const toolOnlyPattern = /^\s*(<tool_use>[\s\S]*<\/tool_use>\s*)+$/
  if (toolOnlyPattern.test(userMessage.trim()) && assistantResponse.trim().length < 20) return true

  // System/control messages
  const controlPatterns = [
    /^\s*\[system\]/i,
    /^\s*\[control\]/i,
    /^\s*\/\w+/, // slash commands
  ]
  if (controlPatterns.some((p) => p.test(userMessage.trim()))) return true

  return false
}

/**
 * Extract structured data from a conversation turn using Claude Haiku.
 *
 * Routes through opencode's Provider system so OAuth, API keys, and
 * token refresh are handled identically to the main chat flow.
 *
 * Never throws. Returns EMPTY_EXTRACTION on any failure.
 */
/**
 * Compaction-time extraction wrapper. Always runs regardless of
 * LEGION_EXTRACTION_ENABLED — compaction must capture structured data
 * before context is discarded.
 */
export async function extractForCompaction(userMessage: string, assistantResponse: string): Promise<TurnExtraction> {
  if (shouldSkipExtraction(userMessage, assistantResponse)) {
    log.debug("skipping compaction extraction", { reason: "skip_check" })
    return EMPTY_EXTRACTION
  }
  return _doExtract(userMessage, assistantResponse)
}

export async function extractTurn(
  userMessage: string,
  assistantResponse: string,
  sessionContext?: { recentTopics?: string[]; sessionId?: string; previousState?: TurnExtraction[] },
): Promise<TurnExtraction> {
  if (shouldSkipExtraction(userMessage, assistantResponse)) {
    log.debug("skipping extraction", { reason: "skip_check" })
    return EMPTY_EXTRACTION
  }

  return _doExtract(userMessage, assistantResponse, sessionContext)
}

/**
 * Shared extraction core. Calls Haiku, returns EMPTY_EXTRACTION on any error.
 */
async function _doExtract(
  userMessage: string,
  assistantResponse: string,
  sessionContext?: { recentTopics?: string[]; sessionId?: string; previousState?: TurnExtraction[] },
): Promise<TurnExtraction> {
  try {
    const model = await Provider.getModel(EXTRACTION_PROVIDER_ID, EXTRACTION_MODEL_ID)
    const language = await Provider.getLanguage(model)

    let content = `User message:\n${userMessage}\n\nAssistant response:\n${assistantResponse}`
    if (sessionContext?.recentTopics?.length) {
      content += `\n\nRecent topics in this session: ${sessionContext.recentTopics.join(", ")}`
    }

    const result = await generateObject({
      model: language,
      schema: TurnExtraction,
      schemaName: "TurnExtraction",
      schemaDescription:
        "Structured extraction of concepts, decisions, preferences, topics, and code references from a conversation turn",
      system: buildExtractionPromptWithState(sessionContext?.previousState),
      messages: [{ role: "user", content }],
      providerOptions: {
        anthropic: {
          structuredOutputMode: "outputFormat",
        },
      },
    })

    const extraction = result.object

    const hasContent =
      extraction.concepts.length > 0 ||
      extraction.decisions.length > 0 ||
      extraction.preferences.length > 0 ||
      extraction.topics.length > 0 ||
      extraction.code_references.length > 0

    if (!hasContent) {
      log.debug("extraction produced empty result")
      return EMPTY_EXTRACTION
    }

    log.debug("extraction complete", {
      concepts: extraction.concepts.length,
      decisions: extraction.decisions.length,
      intent: extraction.intent,
    })
    return extraction
  } catch (error) {
    if (error instanceof APICallError) {
      if (error.statusCode === 429) {
        log.warn("extraction rate limited")
        return EMPTY_EXTRACTION
      }
      if (error.statusCode === 401) {
        log.error("extraction auth failed", { status: error.statusCode })
        return EMPTY_EXTRACTION
      }
      log.error("extraction API error", {
        status: error.statusCode,
        message: error.message,
      })
      return EMPTY_EXTRACTION
    }

    if (error instanceof SyntaxError) {
      log.error("extraction JSON parse error", { error })
      return EMPTY_EXTRACTION
    }
    if (error && typeof error === "object" && "issues" in error) {
      log.error("extraction schema validation failed", { error })
      return EMPTY_EXTRACTION
    }

    log.error("extraction unexpected error", {
      error: error instanceof Error ? error : String(error),
    })
    return EMPTY_EXTRACTION
  }
}
