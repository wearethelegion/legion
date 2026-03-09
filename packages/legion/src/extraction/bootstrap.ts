/**
 * Session Bootstrap from Graph (Phase 3.3)
 *
 * On session start, pulls all available context from the LEGION graph
 * and uses a fast Haiku call to synthesize it into an actionable
 * "where we left off" narrative for the system prompt.
 *
 * Gives the assistant continuity from the first message.
 */

import { generateText, APICallError } from "ai"
import { isLegionAvailable, getLegionClient } from "../legion/auth"
import { Provider } from "../provider/provider"
import { Log } from "../util/log"

const log = Log.create({ service: "extraction.bootstrap" })

const SYNTHESIS_MODEL_ID = "claude-haiku-4-5-20251001"
const SYNTHESIS_PROVIDER_ID = "anthropic"

const SYNTHESIS_PROMPT = `You are a session continuity assistant. You receive raw context data extracted from previous conversations with this user. Your job is to synthesize it into a concise, actionable summary that helps the main assistant pick up where the last session left off.

## Rules

- Write in second person ("You were working on...", "The user prefers...")
- Focus on WHAT was happening and WHERE things left off, not just listing facts
- Prioritize: active work > recent decisions > preferences > general concepts
- If there are code references, mention the specific files/functions and what was being done with them
- Keep it under 300 words — dense and actionable, not verbose
- If the data is too sparse to form a useful narrative, say so briefly rather than padding
- Do NOT invent details not present in the data
- Do NOT include markdown headers — the output will be placed inside an existing section`

export namespace SessionBootstrap {
  /**
   * Bootstrap a new session with graph context synthesized by Haiku.
   * Returns a system prompt section string, or null if LEGION is unavailable
   * or no relevant data exists.
   */
  export async function bootstrap(params: {
    sessionId: string
    projectId?: string
    userId?: string
  }): Promise<string | null> {
    if (!isLegionAvailable()) return null

    log.debug("bootstrapping session", { sessionId: params.sessionId })

    const start = performance.now()
    const raw = await gatherRawContext(params)

    if (!raw) {
      log.debug("no bootstrap data found")
      return null
    }

    const synthesis = await synthesize(raw)

    if (!synthesis) {
      // Haiku failed — fall back to template formatting
      log.warn("synthesis failed, using template fallback")
      return formatFallback(raw)
    }

    log.info("bootstrap complete", {
      ms: Math.round(performance.now() - start),
    })

    return `## Your Memory\n\n${synthesis}`
  }

  /** Raw context gathered from the graph before synthesis. */
  export interface RawContext {
    preferences: { category: string; key: string; value: string }[]
    decisions: { choice: string; chosen: string; reasoning: string }[]
    topics: { name: string; status: string }[]
    codeRefs: { summary: string; relationships: string[] }[]
    concepts: { summary: string; relationships: string[] }[]
    engagements: { name: string; goal: string; status: string }[]
  }

  /**
   * Pull all available context from the graph: profile + recall.
   * Returns null if nothing found.
   */
  export async function gatherRawContext(params: { projectId?: string; userId?: string }): Promise<RawContext | null> {
    const client = getLegionClient()
    if (!client) return null

    const profile = await client.getUserProfile({
      projectId: params.projectId,
      userId: params.userId,
    })
    const preferences = (profile.preferences ?? []).map((p) => ({
      category: p.category,
      key: p.key,
      value: p.value,
    }))
    const decisions = (profile.recent_decisions ?? []).map((d) => ({
      choice: d.summary,
      chosen: d.chose,
      reasoning: d.reasoning,
    }))

    let engagements: { name: string; goal: string; status: string }[] = []
    if (params.projectId) {
      try {
        const engagementsResponse = await client.listEngagements(params.projectId)
        engagements = (engagementsResponse.engagements ?? [])
          .filter((e) => e.status !== "done")
          .map((e) => ({ name: e.name, goal: e.ultimate_goal ?? "", status: e.status }))
      } catch (err) {
        log.warn("failed to fetch engagements for bootstrap", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const recallResponse = await client.recallContext({
      entityNames: [],
      projectId: params.projectId,
      limit: 30,
    })
    const items = recallResponse.context_items ?? []
    const topics = items
      .filter((ci) => ci.type.toLowerCase() === "topic")
      .map((ci) => ({ name: ci.summary, status: "active" }))
    const codeRefs = items
      .filter((ci) => ci.type.toLowerCase() === "codeentity" || ci.type.toLowerCase() === "code_ref")
      .map((ci) => ({ summary: ci.summary, relationships: ci.relationships ?? [] }))
    const concepts = items
      .filter((ci) => ci.type.toLowerCase() === "concept")
      .map((ci) => ({ summary: ci.summary, relationships: ci.relationships ?? [] }))

    const empty =
      preferences.length === 0 &&
      decisions.length === 0 &&
      topics.length === 0 &&
      codeRefs.length === 0 &&
      concepts.length === 0 &&
      engagements.length === 0

    if (empty) return null

    return { preferences, decisions, topics, codeRefs, concepts, engagements }
  }

  /**
   * Use Haiku to synthesize raw graph data into an actionable narrative.
   * Returns null on any failure (caller should use template fallback).
   */
  async function synthesize(raw: RawContext): Promise<string | null> {
    try {
      const model = await Provider.getModel(SYNTHESIS_PROVIDER_ID, SYNTHESIS_MODEL_ID)
      const language = await Provider.getLanguage(model)

      const sections: string[] = ["Here is the raw context data from previous sessions:", ""]

      if (raw.topics.length > 0) {
        sections.push("TOPICS:")
        for (const t of raw.topics) sections.push(`  - ${t.name} (status: ${t.status})`)
        sections.push("")
      }

      if (raw.engagements.length > 0) {
        sections.push("ACTIVE ENGAGEMENTS:")
        for (const e of raw.engagements) sections.push(`  - ${e.name} (status: ${e.status}) — goal: ${e.goal}`)
        sections.push("")
      }

      if (raw.decisions.length > 0) {
        sections.push("DECISIONS:")
        for (const d of raw.decisions) sections.push(`  - ${d.choice}: chose "${d.chosen}" because: ${d.reasoning}`)
        sections.push("")
      }

      if (raw.preferences.length > 0) {
        sections.push("USER PREFERENCES:")
        for (const p of raw.preferences) sections.push(`  - [${p.category}] ${p.key}: ${p.value}`)
        sections.push("")
      }

      if (raw.codeRefs.length > 0) {
        sections.push("CODE REFERENCES:")
        for (const c of raw.codeRefs) {
          const rels = c.relationships.filter((r) => r.length > 0)
          sections.push(`  - ${c.summary}${rels.length > 0 ? ` (related: ${rels.join(", ")})` : ""}`)
        }
        sections.push("")
      }

      if (raw.concepts.length > 0) {
        sections.push("CONCEPTS:")
        for (const c of raw.concepts) {
          const rels = c.relationships.filter((r) => r.length > 0)
          sections.push(`  - ${c.summary}${rels.length > 0 ? ` (related: ${rels.join(", ")})` : ""}`)
        }
        sections.push("")
      }

      sections.push("Synthesize this into an actionable continuity summary.")

      const result = await generateText({
        model: language,
        system: SYNTHESIS_PROMPT,
        messages: [{ role: "user", content: sections.join("\n") }],
        maxOutputTokens: 600,
        providerOptions: {
          anthropic: {
            thinking: { type: "disabled" },
          },
        },
      })

      const text = result.text.trim()
      if (text.length < 20) return null

      return text
    } catch (error) {
      if (error instanceof APICallError) {
        log.warn("bootstrap synthesis API error", { status: error.statusCode })
        return null
      }
      log.warn("bootstrap synthesis failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Template-based fallback when Haiku synthesis fails.
   * Better than nothing — uses the improved formatting.
   */
  function formatFallback(raw: RawContext): string {
    const sections: string[] = [
      "## Your Memory",
      "",
      "Context from prior sessions (synthesis unavailable — raw data follows):",
      "",
    ]

    if (raw.topics.length > 0) {
      sections.push("### What Was Being Worked On")
      for (const t of raw.topics) sections.push(`- ${t.name} (${t.status})`)
      sections.push("")
    }

    if (raw.engagements.length > 0) {
      sections.push("### Active Engagements")
      for (const e of raw.engagements) sections.push(`- **${e.name}** (${e.status}) — ${e.goal}`)
      sections.push("")
    }

    if (raw.decisions.length > 0) {
      sections.push("### Decisions Already Made")
      for (const d of raw.decisions) sections.push(`- **${d.choice}:** ${d.chosen} — ${d.reasoning}`)
      sections.push("")
    }

    if (raw.preferences.length > 0) {
      sections.push("### User Preferences")
      for (const p of raw.preferences) sections.push(`- **${p.category}** — ${p.key}: ${p.value}`)
      sections.push("")
    }

    if (raw.codeRefs.length > 0) {
      sections.push("### Code Context")
      for (const c of raw.codeRefs) sections.push(`- ${c.summary}`)
      sections.push("")
    }

    if (raw.concepts.length > 0) {
      sections.push("### Technical Context")
      for (const c of raw.concepts) sections.push(`- ${c.summary}`)
      sections.push("")
    }

    return sections.join("\n")
  }
}
