import z from "zod"
import { Tool } from "../tool"
import { client, output, stringRecord, projectId } from "./index"

const CreateKnowledgeTool = Tool.define("createKnowledge", {
  description:
    "Store text for semantic search. Use for docs, notes, unstructured text. No LLM calls. Requires engagement_id.",
  parameters: z.object({
    text: z.string().describe("Text content to store"),
    when_to_use: z.string().describe("When this knowledge should be consulted"),
    metadata: z.record(z.string(), z.string()).optional().describe("Optional tags"),
    request_id: z.string().optional().describe("Idempotency key"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().createKnowledge(params.text, projectId(), params.when_to_use, {
      metadata: params.metadata,
      requestId: params.request_id,
    })
    return output(result)
  },
})

const QueryKnowledgeTool = Tool.define("queryKnowledge", {
  description: "Search stored knowledge using hybrid retrieval (vector + graph). For docs, architecture, decisions.",
  parameters: z.object({
    query: z.string().describe("Natural language question"),
    limit: z.number().optional().default(10),
  }),
  async execute(params) {
    const result = await client().queryKnowledge(params.query, projectId(), params.limit)
    return output(result)
  },
})

const FastQueryTool = Tool.define("fastQuery", {
  description: "Fast vector-only search. Now identical to queryKnowledge. Kept for compatibility.",
  parameters: z.object({
    query: z.string().describe("Search text"),
    limit: z.number().optional().default(10),
  }),
  async execute(params) {
    const result = await client().fastQuery(params.query, projectId(), params.limit)
    return output(result)
  },
})

const SearchByTagsTool = Tool.define("searchByTags", {
  description: "Filter knowledge by metadata fields. Exact matching, not semantic search.",
  parameters: z.object({
    keywords: z.array(z.string()).optional(),
    chunk_type: z.string().optional().describe("prose, code, or heading"),
    has_code: z.boolean().optional(),
    section_title: z.string().optional(),
    section_level: z.number().optional(),
    limit: z.number().optional().default(10),
    offset: z.number().optional().default(0),
  }),
  async execute(params) {
    const result = await client().searchByTags(projectId(), {
      keywords: params.keywords,
      chunkType: params.chunk_type,
      hasCode: params.has_code,
      sectionTitle: params.section_title,
      sectionLevel: params.section_level,
      limit: params.limit,
      offset: params.offset,
    })
    return output(result)
  },
})

const ExploreGraphTool = Tool.define("exploreGraph", {
  description: "Run custom Cypher queries on Neo4j knowledge graph.",
  parameters: z.object({
    cypher: z.string().describe("Cypher query (use $param for parameters)"),
    params: z.record(z.string(), z.string()).optional().describe("Optional tags"),
    limit: z.number().optional().default(100),
  }),
  async execute(params) {
    const result = await client().exploreGraph(params.cypher, projectId(), {
      params: params.params,
      limit: params.limit,
    })
    return output(result)
  },
})

export const KnowledgeTools = [
  CreateKnowledgeTool,
  QueryKnowledgeTool,
  FastQueryTool,
  SearchByTagsTool,
  ExploreGraphTool,
]
