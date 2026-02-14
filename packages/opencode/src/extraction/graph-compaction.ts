/**
 * Graph-Based Compaction (Phase 5)
 *
 * Replaces the default LLM-based compaction with a graph-backed approach.
 * When context overflows, instead of running an LLM to summarize:
 *   1. Query Neo4j for all knowledge extracted from the current session
 *   2. Format as structured summary (decisions, topics, preferences, code refs)
 *   3. Keep last N raw turns for immediate context
 *
 * Benefits:
 * - No LLM call needed (saves time + cost)
 * - Knowledge already extracted by Haiku on every turn
 * - Session ID scopes the query precisely
 * - Structured output (not lossy summarization)
 */

import { isLegionAvailable, getLegionClient } from "../legion/auth"
import { Log } from "../util/log"

const log = Log.create({ service: "extraction.graph-compaction" })

export namespace GraphCompaction {
  /**
   * Query the graph for all knowledge from the current session
   * and format as a structured compaction summary.
   *
   * Returns null if LEGION is unavailable or no data found.
   */
  export async function buildSessionSummary(params: { sessionId: string; projectId?: string }): Promise<string | null> {
    if (!isLegionAvailable()) return null

    const client = getLegionClient()
    if (!client) return null

    const start = performance.now()

    const response = await client.recallContext({
      sessionId: params.sessionId,
      projectId: params.projectId,
      limit: 80,
    })

    const items = response.context_items ?? []
    if (items.length === 0) {
      log.info("no graph data for session", { sessionId: params.sessionId })
      return null
    }

    const summary = formatSessionSummary(items)
    log.info("graph compaction summary built", {
      sessionId: params.sessionId,
      items: items.length,
      ms: Math.round(performance.now() - start),
    })

    return summary
  }

  /**
   * Format graph context items into a structured summary
   * suitable for replacing the LLM compaction output.
   */
  export function formatSessionSummary(
    items: Array<{ type: string; summary: string; relationships: string[]; timestamp: string; confidence: string }>,
  ): string {
    const decisions: string[] = []
    const topics: string[] = []
    const preferences: string[] = []
    const codeRefs: string[] = []
    const concepts: string[] = []

    for (const item of items) {
      const t = item.type.toLowerCase()
      if (t === "decision") decisions.push(item.summary)
      else if (t === "topic") topics.push(item.summary)
      else if (t === "preference") preferences.push(item.summary)
      else if (t === "codeentity" || t === "code_ref") codeRefs.push(item.summary)
      else if (t === "concept") concepts.push(item.summary)
    }

    const sections: string[] = ["## Session Knowledge (from conversation graph)", ""]

    if (decisions.length > 0) {
      sections.push("### Decisions Made")
      for (const d of decisions) sections.push(`- ${d}`)
      sections.push("")
    }

    if (topics.length > 0) {
      sections.push("### Topics Discussed")
      for (const t of topics) sections.push(`- ${t}`)
      sections.push("")
    }

    if (preferences.length > 0) {
      sections.push("### User Preferences")
      for (const p of preferences) sections.push(`- ${p}`)
      sections.push("")
    }

    if (codeRefs.length > 0) {
      sections.push("### Code References")
      for (const c of codeRefs) sections.push(`- ${c}`)
      sections.push("")
    }

    if (concepts.length > 0) {
      sections.push("### Key Concepts")
      for (const c of concepts) sections.push(`- ${c}`)
      sections.push("")
    }

    return sections.join("\n")
  }
}
