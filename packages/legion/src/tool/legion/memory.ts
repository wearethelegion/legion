import z from "zod"
import { Tool } from "../tool"
import { client, output, stringRecord, companyId, projectId } from "./index"

const RememberTool = Tool.define("remember", {
  description: "Store short-term memory for current session, optionally promote to permanent. Requires engagement_id.",
  parameters: z.object({
    agent_id: z.string().describe("Agent UUID who is remembering"),
    memory_key: z.string().describe("Unique identifier for the memory"),
    content: z.string().describe("What to remember"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
    ttl_minutes: z.number().optional().default(0).describe("0 = session-only"),
    promote_to_permanent: z.boolean().optional().default(false),
    memory_type: z.string().optional().describe("fact, preference, learned_pattern, instruction"),
    importance: z.number().optional().default(5).describe("1-10 scale"),
  }),
  async execute(params) {
    const result = await client().remember({
      projectId: projectId(),
      agentId: params.agent_id,
      memoryKey: params.memory_key,
      content: params.content,
      engagementId: params.engagement_id,
      ttlMinutes: params.ttl_minutes,
      promoteToPermanent: params.promote_to_permanent,
      memoryType: params.memory_type,
      importance: params.importance,
    })
    return output(result)
  },
})

const RecallTool = Tool.define("recall", {
  description: "Semantic search across memories (working + permanent).",
  parameters: z.object({
    query: z.string().describe("Semantic search query"),
    agent_id: z.string().optional(),
    limit: z.number().optional().default(10),
    include_permanent: z.boolean().optional().default(true),
    include_working: z.boolean().optional().default(true),
    engagement_id: z.string().optional(),
    memory_type: z.string().optional(),
    min_importance: z.number().optional().default(0),
  }),
  async execute(params) {
    const result = await client().recall(params.query, projectId(), {
      agentId: params.agent_id,
      limit: params.limit,
      includePermanent: params.include_permanent,
      includeWorking: params.include_working,
      engagementId: params.engagement_id,
      memoryType: params.memory_type,
      minImportance: params.min_importance,
    })
    return output(result)
  },
})

const RememberPermanentTool = Tool.define("rememberPermanent", {
  description: "Create permanent memory that persists forever. Requires engagement_id.",
  parameters: z.object({
    memory_type: z.string().describe("fact, preference, learned_pattern, instruction"),
    key: z.string().describe("Unique identifier within scope"),
    content: z.string().describe("Memory content (markdown)"),
    agent_id: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional().describe("Optional tags"),
    importance: z.number().optional().default(5),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().createPermanentMemory({
      companyId: companyId(),
      projectId: projectId(),
      memoryType: params.memory_type,
      key: params.key,
      content: params.content,
      agentId: params.agent_id,
      metadata: params.metadata,
      importance: params.importance,
    })
    return output(result)
  },
})

const EditPermanentMemoryTool = Tool.define("editPermanentMemory", {
  description: "Update an existing permanent memory. Requires engagement_id.",
  parameters: z.object({
    memory_id: z.string().describe("Permanent memory UUID"),
    content: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional().describe("Optional tags"),
    importance: z.number().optional().default(0),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().updatePermanentMemory(params.memory_id, {
      content: params.content,
      metadata: params.metadata,
      importance: params.importance,
    })
    return output(result)
  },
})

const DeletePermanentMemoryTool = Tool.define("deletePermanentMemory", {
  description: "Delete a permanent memory. Cannot be undone. Requires engagement_id.",
  parameters: z.object({
    memory_id: z.string().describe("Permanent memory UUID"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().deletePermanentMemory(params.memory_id)
    return output(result)
  },
})

// const GetActiveWorkStatusTool = Tool.define("getActiveWorkStatus", {
//   description: "Get agent's current work context (active engagement, memory counts, last activity).",
//   parameters: z.object({
//     agent_id: z.string().optional(),
//   }),
//   async execute(params) {
//     const result = await client().getActiveWorkStatus(projectId(), params.agent_id)
//     return output(result)
//   },
// })

export const MemoryTools = [
  RememberTool,
  RecallTool,
  RememberPermanentTool,
  EditPermanentMemoryTool,
  DeletePermanentMemoryTool,
  // GetActiveWorkStatusTool,
]
