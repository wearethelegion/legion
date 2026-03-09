/**
 * Session Bridge Construction (Phase 3.4)
 *
 * When the context window approaches its limit, builds a "bridge" summary
 * of the current session state and stores it in the LEGION graph.
 * The next session can use this bridge to resume where we left off.
 *
 * Triggered by ContextMonitor when usage >= threshold.
 */

import { isLegionAvailable, getLegionClient } from "../legion/auth"
import { Log } from "../util/log"

const log = Log.create({ service: "extraction.bridge" })

export namespace SessionBridge {
  /**
   * Build and store a session bridge in the graph.
   * Returns true on success, false if LEGION is unavailable or storage fails.
   */
  export async function buildBridge(params: {
    sessionId: string
    activeTopics: { name: string; status: string }[]
    openQuestions?: string[]
    nextSteps?: string[]
  }): Promise<boolean> {
    if (!isLegionAvailable()) return false

    const summary = composeSummary(params)

    if (summary.length === 0) {
      log.debug("empty bridge summary, skipping")
      return false
    }

    log.debug("building session bridge", {
      sessionId: params.sessionId,
      topics: params.activeTopics.length,
      questions: params.openQuestions?.length ?? 0,
      steps: params.nextSteps?.length ?? 0,
    })

    const client = getLegionClient()
    if (!client) return false
    await client.buildSessionBridge({
      sessionId: params.sessionId,
    })
    log.info("session bridge stored", { sessionId: params.sessionId })

    return true
  }

  /**
   * Compose the bridge text from active threads, open questions, and next steps.
   */
  export function composeSummary(params: {
    activeTopics: { name: string; status: string }[]
    openQuestions?: string[]
    nextSteps?: string[]
  }): string {
    const sections: string[] = []

    if (params.activeTopics.length > 0) {
      sections.push("## Active Threads")
      for (const topic of params.activeTopics) {
        sections.push(`- ${topic.name} (${topic.status})`)
      }
      sections.push("")
    }

    if (params.openQuestions && params.openQuestions.length > 0) {
      sections.push("## Open Questions")
      for (const q of params.openQuestions) {
        sections.push(`- ${q}`)
      }
      sections.push("")
    }

    if (params.nextSteps && params.nextSteps.length > 0) {
      sections.push("## Next Steps")
      for (const step of params.nextSteps) {
        sections.push(`- ${step}`)
      }
      sections.push("")
    }

    return sections.join("\n")
  }
}
