/**
 * Pre-Turn Graph Context Injection (Phase 3.1)
 *
 * Pulls relevant context from the LEGION graph before each user turn.
 * Lightweight entity extraction (regex, not LLM) keeps latency under 300ms.
 */

import { isLegionAvailable, getLegionClient } from "../legion/auth"
import { Log } from "../util/log"

const log = Log.create({ service: "extraction.recall" })

/** A single context item returned from the graph. */
export interface ContextItem {
  type: string
  summary: string
  relationships: string[]
  timestamp: string
  confidence: string
}

export namespace ExtractionRecall {
  /**
   * Main entry — extract entities from the user message, query the graph,
   * and return a natural-language context block for injection.
   *
   * Returns null if LEGION is unavailable or no relevant context found.
   * Performance budget: <300ms total.
   */
  export async function recallForMessage(params: {
    userMessage: string
    sessionId: string
    projectId?: string
  }): Promise<string | null> {
    if (!isLegionAvailable()) return null

    const start = performance.now()

    // Extract significant terms for graph seed matching.
    // Combines regex identifiers with key phrases from the message.
    const entities = extractEntities(params.userMessage)

    // Also extract multi-word key phrases (2-3 word sequences) that may
    // match Topic or Concept names stored in title case in the graph.
    const phrases = extractKeyPhrases(params.userMessage)
    const combined = [...new Set([...entities, ...phrases])].slice(0, 15)

    if (combined.length === 0) {
      log.debug("no entities or phrases extracted, skipping recall")
      return null
    }

    log.debug("recall terms", { count: combined.length, terms: combined })

    const client = getLegionClient()
    if (!client) return null
    const response = await client.recallContext({
      entityNames: combined,
      projectId: params.projectId,
    })
    const items: ContextItem[] = (response.context_items ?? []).map((ci) => ({
      type: ci.type.toLowerCase(),
      summary: ci.summary,
      relationships: ci.relationships ?? [],
      timestamp: ci.timestamp ?? "",
      confidence: ci.confidence ?? "",
    }))

    if (items.length === 0) {
      log.debug("no context items from graph", { ms: Math.round(performance.now() - start) })
      return null
    }

    const block = serializeContext(items)
    log.debug("recall complete", { items: items.length, ms: Math.round(performance.now() - start) })
    return block
  }

  /**
   * Format graph context items as an actionable text block for system prompt injection.
   *
   * Design goals:
   * - The LLM should understand what was happening, not just see labels
   * - Relationships provide "why this matters" context
   * - Low-confidence items are filtered to reduce noise
   * - Sections are named for action, not for data type
   */
  export function serializeContext(items: ContextItem[]): string {
    if (items.length === 0) return ""

    // Filter out low-confidence noise
    const relevant = items.filter((i) => i.confidence !== "low")
    if (relevant.length === 0) return ""

    const decisions: ContextItem[] = []
    const topics: ContextItem[] = []
    const preferences: ContextItem[] = []
    const code: ContextItem[] = []
    const concepts: ContextItem[] = []

    for (const item of relevant) {
      if (item.type === "decision") decisions.push(item)
      else if (item.type === "topic") topics.push(item)
      else if (item.type === "preference") preferences.push(item)
      else if (item.type === "codeentity" || item.type === "code_ref") code.push(item)
      else if (item.type === "concept") concepts.push(item)
    }

    const sections: string[] = [
      "## Relevant Context from Prior Conversations",
      "",
      "Use this context to maintain continuity with previous sessions. Reference it when relevant but do not repeat it verbatim to the user.",
      "",
    ]

    if (decisions.length > 0) {
      sections.push("### Decisions Already Made")
      sections.push("These choices were made previously — do not re-ask or re-debate unless the user brings them up:")
      for (const d of decisions) sections.push(formatItem(d))
      sections.push("")
    }

    if (topics.length > 0) {
      sections.push("### What Was Being Worked On")
      for (const t of topics) sections.push(formatItem(t))
      sections.push("")
    }

    if (preferences.length > 0) {
      sections.push("### User Preferences")
      sections.push("Respect these without asking for confirmation:")
      for (const p of preferences) sections.push(formatItem(p))
      sections.push("")
    }

    if (code.length > 0) {
      sections.push("### Code Context")
      for (const c of code) sections.push(formatItem(c))
      sections.push("")
    }

    if (concepts.length > 0) {
      sections.push("### Technical Context")
      for (const c of concepts) sections.push(formatItem(c))
      sections.push("")
    }

    return sections.join("\n")
  }

  /**
   * Format a single context item with its relationships as sub-context.
   * Relationships explain connections ("related to X", "part of Y") that
   * make the summary actionable rather than just a label.
   */
  function formatItem(item: ContextItem): string {
    const rels = item.relationships.filter((r) => r.length > 0)
    if (rels.length === 0) return `- ${item.summary}`
    return `- ${item.summary}\n  - Related: ${rels.join("; ")}`
  }

  /**
   * Extract significant multi-word phrases from the user message.
   * These match Topic/Concept names stored in the graph (e.g., "infinite conversation").
   * Filters out stop words and returns 2-3 word noun-like sequences.
   */
  export function extractKeyPhrases(message: string): string[] {
    const stop = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "shall",
      "can",
      "need",
      "must",
      "to",
      "of",
      "in",
      "for",
      "on",
      "with",
      "at",
      "by",
      "from",
      "up",
      "about",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "between",
      "out",
      "off",
      "over",
      "under",
      "again",
      "further",
      "then",
      "once",
      "here",
      "there",
      "when",
      "where",
      "why",
      "how",
      "all",
      "each",
      "every",
      "both",
      "few",
      "more",
      "most",
      "other",
      "some",
      "such",
      "no",
      "nor",
      "not",
      "only",
      "own",
      "same",
      "so",
      "than",
      "too",
      "very",
      "just",
      "because",
      "as",
      "until",
      "while",
      "and",
      "but",
      "or",
      "if",
      "that",
      "this",
      "it",
      "its",
      "i",
      "me",
      "my",
      "we",
      "our",
      "you",
      "your",
      "he",
      "him",
      "his",
      "she",
      "her",
      "they",
      "them",
      "their",
      "what",
      "which",
      "who",
      "whom",
      "these",
      "those",
      "am",
      "let",
      "get",
      "got",
      "make",
      "go",
      "going",
      "come",
      "take",
      "know",
      "think",
      "see",
      "look",
      "want",
      "give",
      "use",
      "find",
      "tell",
      "ask",
      "work",
      "seem",
      "feel",
      "try",
      "leave",
      "call",
    ])

    const words = message
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
    const phrases: string[] = []

    // 2-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      if (!stop.has(words[i]) && !stop.has(words[i + 1])) {
        phrases.push(`${words[i]} ${words[i + 1]}`)
      }
    }

    // 3-word phrases (middle word can be a stop word)
    for (let i = 0; i < words.length - 2; i++) {
      if (!stop.has(words[i]) && !stop.has(words[i + 2])) {
        phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
      }
    }

    return [...new Set(phrases)].slice(0, 8)
  }

  /**
   * Lightweight keyword/entity extraction from a user message.
   * Uses regex — no LLM call — to stay under the 300ms budget.
   *
   * Extracts:
   * - PascalCase / camelCase identifiers
   * - File paths (containing / or .)
   * - Quoted strings
   * - Known tech terms
   */
  export function extractEntities(message: string): string[] {
    const found = new Set<string>()

    // PascalCase and camelCase identifiers (2+ chars, starts with upper or lower+upper)
    const camelPattern = /\b[A-Z][a-zA-Z0-9]{2,}\b/g
    const camelMatches = message.match(camelPattern)
    if (camelMatches) {
      for (const m of camelMatches) found.add(m)
    }

    // camelCase specifically (lowercase then uppercase)
    const lowerCamelPattern = /\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g
    const lowerCamelMatches = message.match(lowerCamelPattern)
    if (lowerCamelMatches) {
      for (const m of lowerCamelMatches) found.add(m)
    }

    // File paths — sequences with / or ending in common extensions
    const pathPattern = /(?:[\w.-]+\/)+[\w.-]+|[\w-]+\.(?:ts|tsx|js|jsx|py|rb|go|rs|sql|yml|yaml|json|toml|md)/g
    const pathMatches = message.match(pathPattern)
    if (pathMatches) {
      for (const m of pathMatches) found.add(m)
    }

    // Quoted strings (single or double, 2-60 chars)
    const quotedPattern = /["']([^"']{2,60})["']/g
    let qm: RegExpExecArray | null = null
    while ((qm = quotedPattern.exec(message)) !== null) {
      found.add(qm[1])
    }

    // Known tech terms (case-insensitive match, stored as-is from message)
    const techTerms = [
      "React",
      "Vue",
      "Angular",
      "Svelte",
      "Next.js",
      "Node.js",
      "Bun",
      "Deno",
      "TypeScript",
      "JavaScript",
      "Python",
      "Ruby",
      "Go",
      "Rust",
      "Docker",
      "Kubernetes",
      "PostgreSQL",
      "Redis",
      "Neo4j",
      "gRPC",
      "GraphQL",
      "REST",
      "Tailwind",
      "Prisma",
      "Drizzle",
      "Zod",
      "tRPC",
      "Anthropic",
      "OpenAI",
      "LEGION",
      "Claude",
      "Haiku",
      "Sonnet",
      "Opus",
    ]
    const lower = message.toLowerCase()
    for (const term of techTerms) {
      if (lower.includes(term.toLowerCase())) found.add(term)
    }

    // Deduplicate and limit to 10
    const result = Array.from(found).slice(0, 10)
    return result
  }
}
