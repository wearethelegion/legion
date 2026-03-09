import z from "zod"
import { generateText, tool as aiTool, jsonSchema } from "ai"
import { Tool } from "../tool"
import { client, output, projectId } from "./index"
import { Provider } from "../../provider/provider"

const SYSTEM = `You are a search strategist inside LEGION, an AI knowledge management system.

Your job is to help find information across LEGION's data stores:
- knowledge: Documentation, notes, unstructured text
- expertise: Structured guides, tutorials, best practices
- lessons: Resolved issues (symptom, root cause, solution)
- entries: Engagement entries (decisions, plans, insights, notes)
- memories: Working and permanent memories from agents

You receive search results and must decide:
1. Are these results sufficient to answer the original query?
2. If not, what refined query would help find missing information?

When you have enough information, synthesize a coherent answer that matches the requestor's intent:
- "how does X work?" → explain it
- "what did we decide about Y?" → surface the decision with context
- "has anyone solved Z before?" → surface lessons and solutions
- "what do we know about W?" → comprehensive summary

Be concise but thorough. Cite sources by type and title.`

async function model() {
  // const env = process.env.LEGION_INNER_AI_MODEL
  // if (env) {
  //   const parsed = Provider.parseModel(env)
  //   const m = await Provider.getModel(parsed.providerID, parsed.modelID)
  //   return Provider.getLanguage(m)
  // }
  const def = await Provider.defaultModel()
  const small = await Provider.getSmallModel(def.providerID)
  if (small) return Provider.getLanguage(small)
  return Provider.getLanguage(await Provider.getModel(def.providerID, def.modelID))
}

async function synthesize(system: string, message: string, max = 2048): Promise<string | null> {
  try {
    const lm = await model()
    const result = await generateText({
      model: lm,
      system,
      messages: [{ role: "user", content: message }],
      maxOutputTokens: max,
    })
    return result.text || null
  } catch {
    return null
  }
}

interface SearchDecision {
  action: string
  refined_query?: string
  types?: string[]
  reasoning: string
}

async function decide(system: string, message: string): Promise<SearchDecision | null> {
  try {
    const lm = await model()
    const result = await generateText({
      model: lm,
      system,
      messages: [{ role: "user", content: message }],
      maxOutputTokens: 1024,
      tools: {
        search_decision: aiTool({
          description: "Decide whether to refine the search or consolidate results",
          inputSchema: jsonSchema({
            type: "object" as const,
            properties: {
              action: { type: "string", enum: ["refine", "consolidate"] },
              refined_query: { type: "string" },
              types: { type: "array", items: { type: "string" } },
              reasoning: { type: "string" },
            },
            required: ["action", "reasoning"],
          }),
        }),
      },
      toolChoice: { type: "tool", toolName: "search_decision" },
    })
    const call = result.toolCalls[0]
    if (!call) return null
    return call.input as SearchDecision
  } catch {
    return null
  }
}

function format(results: Array<{ type: string; title: string; snippet: string; score: number }>): string {
  if (!results.length) return "(no results found)"
  return results
    .map((r, i) => `${i + 1}. [${r.type}] ${r.title}\n   Score: ${r.score.toFixed(2)}\n   ${r.snippet.slice(0, 300)}`)
    .join("\n\n")
}

const WhatIKnowTool = Tool.define("whatIKnow", {
  description: `Unified search across ALL LEGION knowledge with AI-powered synthesis.
Searches knowledge, expertise, lessons, entries, and memories in parallel,
then uses an inner AI to refine and synthesize results into a coherent answer.
Use this for any question about what LEGION knows.

Data types available:
- knowledge: stored text chunks (docs, notes, unstructured text)
- expertise: structured guides, tutorials, best practices
- lessons: resolved issues with symptom/root-cause/solution
- entries: engagement entries (requirements, decisions, plans, insights)
- memories: agent working and permanent memories

Usage patterns:
- Broad question ("what do we know about auth?"): omit types, let it search everything
- Targeted recall ("what lessons about Neo4j?"): set types to ["lessons"]
- Architecture context ("how is the extraction pipeline designed?"): set types to ["knowledge", "expertise", "entries"]
- Scoped to project: pass project_id to avoid slow company-wide fan-out
- Quick answer: set max_hops to 1 to skip refinement iterations`,
  parameters: z.object({
    query: z.string().describe("Natural language question — be specific for better results"),
    types: z
      .array(z.enum(["knowledge", "expertise", "lessons", "entries", "memories"]))
      .optional()
      .describe("Filter to specific data types. Omit to search all 5 types."),
    project_id: z.string().optional().describe("Scope to a project UUID. Omit for company-wide search (slower)."),
    max_hops: z.number().optional().default(3).describe("Max AI refinement iterations (1 = no refinement, default 3)"),
    engagement_id: z.string().optional().describe("LEGION engagement UUID for traceability"),
  }),
  async execute(params) {
    const hops = Math.max(1, Math.min(params.max_hops ?? 3, 10))
    const pid = params.project_id

    // Phase 1: Broad sweep
    const initial = await client().unifiedSearch(params.query, pid, { types: params.types })
    const sources = [...(initial.results ?? [])]
    let iterations = 1
    let resolved = "none"

    try {
      // Phase 2: Refine
      while (iterations < hops) {
        const prompt = `## Original Query\n${params.query}\n\n## Search Results (iteration ${iterations})\n${format(sources)}\n\nShould I search more or do I have enough?`
        const decision = await decide(SYSTEM, prompt)
        if (!decision || decision.action === "consolidate") break

        if (decision.refined_query && decision.refined_query !== params.query) {
          const more = await client().unifiedSearch(decision.refined_query, pid, { types: decision.types })
          const ids = new Set(sources.map((s) => s.id))
          for (const r of more.results ?? []) {
            if (!ids.has(r.id)) {
              sources.push(r)
              ids.add(r.id)
            }
          }
        }
        iterations++
      }

      // Phase 3: Consolidate
      const consolidation = `## Original Query\n${params.query}\n\n## All Results (${sources.length} sources)\n${format(sources)}\n\nSynthesize a coherent answer. Cite sources by [type: title].`
      const answer = await synthesize(SYSTEM, consolidation)

      const lm = await model()
      resolved = lm.modelId

      const seen = new Set<string>()
      const unique = sources.filter((s) => {
        if (seen.has(s.id)) return false
        seen.add(s.id)
        return true
      })

      return output({
        status: "success",
        answer: answer ?? `AI synthesis unavailable. Raw results:\n\n${format(sources)}`,
        sources: unique.map((s) => ({
          type: s.type,
          id: s.id,
          title: s.title,
          snippet: (s.snippet ?? "").slice(0, 200),
          score: s.score,
          project_id: s.project_id,
        })),
        search_iterations: iterations,
        model_used: resolved,
      })
    } catch {
      // Provider unavailable — return raw results
      return output({
        status: "success",
        answer: format(sources),
        sources: sources.map((s) => ({
          type: s.type,
          id: s.id,
          title: s.title,
          snippet: (s.snippet ?? "").slice(0, 200),
          score: s.score,
          project_id: s.project_id,
        })),
        search_iterations: iterations,
        model_used: "none",
      })
    }
  },
})

export const WhatIKnowTools: Tool.Info[] = [WhatIKnowTool]
