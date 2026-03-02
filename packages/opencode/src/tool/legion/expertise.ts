import z from "zod"
import { Tool } from "../tool"
import { client, output, stringRecord, companyId, projectId } from "./index"

const CreateExpertiseTool = Tool.define("createExpertise", {
  description:
    "Store structured knowledge with hierarchical sections (guides, tutorials, best practices). Requires engagement_id.",
  parameters: z.object({
    text: z.string().describe("Markdown text with headings"),
    when_to_use: z.string().describe("When this expertise should be used"),
    metadata: z.record(z.string(), z.string()).optional().describe("Optional tags"),
    request_id: z.string().optional(),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().createExpertise(params.text, params.when_to_use, {
      projectId: projectId(),
      companyId: companyId(),
      metadata: params.metadata,
      requestId: params.request_id,
    })
    return output(result)
  },
})

const AddExpertiseChunkTool = Tool.define("addExpertiseChunk", {
  description: "Add a section/subsection to existing expertise document. Requires engagement_id.",
  parameters: z.object({
    expertise_id: z.string().describe("Expertise UUID"),
    content: z.string().describe("Section content (markdown)"),
    parent_chunk_id: z.string().optional().describe("Parent chunk for nesting"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().addExpertiseChunk(params.expertise_id, params.content, {
      parentChunkId: params.parent_chunk_id,
      projectId: projectId(),
    })
    return output(result)
  },
})

const QueryExpertiseTool = Tool.define("queryExpertise", {
  description: "Search expertise documents (guides, tutorials, best practices).",
  parameters: z.object({
    query: z.string().describe("Natural language question"),
    limit: z.number().optional().default(10),
  }),
  async execute(params) {
    const result = await client().queryExpertise(params.query, {
      projectId: projectId(),
      companyId: companyId(),
      limit: params.limit,
    })
    return output(result)
  },
})

const ListExpertiseTool = Tool.define("listExpertise", {
  description: "List expertise documents without searching.",
  parameters: z.object({
    limit: z.number().optional().default(100),
    offset: z.number().optional().default(0),
  }),
  async execute(params) {
    const result = await client().listExpertise({
      projectId: projectId(),
      companyId: companyId(),
      limit: params.limit,
      offset: params.offset,
    })
    return output(result)
  },
})

const GetExpertiseTool = Tool.define("getExpertise", {
  description: "Get full content of a specific expertise document by ID.",
  parameters: z.object({
    expertise_id: z.string().describe("Expertise UUID"),
  }),
  async execute(params) {
    const result = await client().getExpertise(params.expertise_id)
    return output(result)
  },
})

const UpdateExpertiseTool = Tool.define("updateExpertise", {
  description: "Update an existing expertise document. Only provided fields are changed. Requires engagement_id.",
  parameters: z.object({
    expertise_id: z.string().describe("Expertise UUID"),
    when_to_use: z.string().optional().describe("When this expertise should be used"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().updateExpertise(params.expertise_id, {
      whenToUse: params.when_to_use,
    })
    return output(result)
  },
})

export const ExpertiseTools = [
  CreateExpertiseTool,
  AddExpertiseChunkTool,
  QueryExpertiseTool,
  ListExpertiseTool,
  GetExpertiseTool,
  UpdateExpertiseTool,
]
