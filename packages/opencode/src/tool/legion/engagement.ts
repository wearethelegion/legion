import z from "zod"
import { Tool } from "../tool"
import { client, output, companyId, projectId } from "./index"

const CreateEngagementTool = Tool.define("createEngagement", {
  description: "Start a new engagement (work session) for a project.",
  parameters: z.object({
    name: z.string().describe("Descriptive name"),
    ultimate_goal: z.string().describe("Overarching objective (min 10 chars)"),
    agent_id: z.string().optional(),
    summary: z.string().optional(),
    engagement_id: z.string().optional().describe("Optional parent engagement UUID for hierarchical nesting"),
  }),
  async execute(params) {
    const result = await client().createEngagement({
      projectId: projectId(),
      name: params.name,
      ultimateGoal: params.ultimate_goal,
      companyId: companyId(),
      agentId: params.agent_id,
      summary: params.summary,
      engagementId: params.engagement_id,
    })
    return output(result)
  },
})

const GetEngagementTool = Tool.define("getEngagement", {
  description: "Get engagement details with entry metadata (lightweight). Use getEntry for full content.",
  parameters: z.object({
    engagement_id: z.string().describe("Engagement UUID"),
  }),
  async execute(params) {
    const result = await client().getEngagement(params.engagement_id)
    return output(result)
  },
})

const ListEngagementsTool = Tool.define("listEngagements", {
  description: "List engagements for a project with optional status filter.",
  parameters: z.object({
    status: z.string().optional().describe("created, preparation, execution, validation, done"),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
    engagement_id: z
      .string()
      .optional()
      .describe("Optional parent engagement UUID to list only children of that engagement"),
  }),
  async execute(params) {
    const result = await client().listEngagements(projectId(), {
      status: params.status,
      limit: params.limit,
      offset: params.offset,
      engagementId: params.engagement_id,
    })
    return output(result)
  },
})

const UpdateEngagementTool = Tool.define("updateEngagement", {
  description: "Update engagement details (name, status, summary, ultimate_goal).",
  parameters: z.object({
    engagement_id: z.string().describe("Engagement UUID — also satisfies the engagement guard"),
    name: z.string().optional(),
    status: z.string().optional().describe("created, preparation, execution, validation, done"),
    summary: z.string().optional(),
    ultimate_goal: z.string().optional(),
    parent_engagement_id: z.string().optional().describe("Optional parent engagement UUID for hierarchical nesting"),
  }),
  async execute(params) {
    const result = await client().updateEngagement(params.engagement_id, {
      name: params.name,
      status: params.status,
      summary: params.summary,
      ultimateGoal: params.ultimate_goal,
      parentEngagementId: params.parent_engagement_id,
    })
    return output(result)
  },
})

const ResumeEngagementTool = Tool.define("resumeEngagement", {
  description: "Get formatted resumption context for an engagement, grouped by entry type.",
  parameters: z.object({
    engagement_id: z.string().describe("Engagement UUID"),
  }),
  async execute(params) {
    const result = await client().resumeEngagement(params.engagement_id)
    return output(result)
  },
})

const AddEntryTool = Tool.define("addEntry", {
  description:
    "Add an entry to an engagement (requirement, insight, decision, plan, note, question). Requires engagement_id.",
  parameters: z.object({
    engagement_id: z.string().optional().describe("Engagement UUID (falls back to LEGION_ENGAGEMENT_ID env var)"),
    entry_type: z.string().describe("requirement, insight, decision, plan, note, question"),
    title: z.string().describe("Short descriptive title"),
    content: z.string().describe("Full entry content (markdown)"),
    agent_id: z.string().optional(),
    references: z.array(z.string()).optional().describe("Entry IDs this references"),
    tags: z.array(z.string()).optional(),
  }),
  async execute(params) {
    const engagementId = params.engagement_id || process.env.LEGION_ENGAGEMENT_ID
    if (!engagementId) {
      throw new Error("engagement_id is required — provide it explicitly or set LEGION_ENGAGEMENT_ID env var")
    }
    const result = await client().addEntry({
      engagementId,
      entryType: params.entry_type,
      title: params.title,
      content: params.content,
      agentId: params.agent_id,
      references: params.references,
      tags: params.tags,
    })
    return output(result)
  },
})

const UpdateEntryTool = Tool.define("updateEntry", {
  description: "Update an existing entry's content, references, or tags. Requires engagement_id.",
  parameters: z.object({
    entry_id: z.string().describe("Entry UUID"),
    content: z.string().optional(),
    references: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().updateEntry(params.entry_id, {
      content: params.content,
      references: params.references,
      tags: params.tags,
    })
    return output(result)
  },
})

const GetEntryTool = Tool.define("getEntry", {
  description: "Get a single entry by ID with full content.",
  parameters: z.object({
    entry_id: z.string().describe("Entry UUID"),
  }),
  async execute(params) {
    const result = await client().getEntry(params.entry_id)
    return output(result)
  },
})

const SearchEntriesTool = Tool.define("searchEntries", {
  description: "Hybrid search across engagement entries (Vector + Graph + RRF fusion).",
  parameters: z.object({
    query: z.string().describe("Search query"),
    engagement_id: z.string().optional(),
    entry_type: z.string().optional(),
    limit: z.number().optional().default(10),
  }),
  async execute(params) {
    const result = await client().searchEntries(params.query, projectId(), {
      engagementId: params.engagement_id,
      entryType: params.entry_type,
      limit: params.limit,
    })
    return output(result)
  },
})

export const EngagementTools = [
  CreateEngagementTool,
  GetEngagementTool,
  ListEngagementsTool,
  UpdateEngagementTool,
  ResumeEngagementTool,
  AddEntryTool,
  UpdateEntryTool,
  GetEntryTool,
  SearchEntriesTool,
]
