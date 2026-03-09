import z from "zod"
import { Tool } from "../tool"
import { client, output, companyId, projectId } from "./index"

const CreateAgentTool = Tool.define("createAgent", {
  description: "Create a new specialist agent. Auto-links learning skill. Requires engagement_id.",
  parameters: z.object({
    name: z.string().describe("Agent name"),
    role: z.string().describe("Functional role (researcher, developer, etc.)"),
    personality: z.string().describe("Personality description and traits"),
    main_responsibilities: z.string().describe("What tasks this agent handles"),
    system_prompt: z.string().describe("Full behavioral instructions"),
    when_to_use: z.string().describe("When to delegate to this agent"),
    capabilities: z.array(z.string()).optional().describe("Skill tags"),
    specialization: z.string().optional().describe("Primary domain"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().createAgent({
      companyId: companyId(),
      name: params.name,
      role: params.role,
      personality: params.personality,
      mainResponsibilities: params.main_responsibilities,
      systemPrompt: params.system_prompt,
      whenToUse: params.when_to_use,
      capabilities: params.capabilities,
      specialization: params.specialization,
    })
    return output(result)
  },
})

const UpdateAgentTool = Tool.define("updateAgent", {
  description: "Update an existing agent. Only provided fields are changed. Requires engagement_id.",
  parameters: z.object({
    agent_id: z.string().describe("Agent UUID"),
    name: z.string().optional(),
    personality: z.string().optional(),
    main_responsibilities: z.string().optional(),
    system_prompt: z.string().optional(),
    when_to_use: z.string().optional().describe("When to delegate to this agent"),
    metadata_json: z.string().optional().describe("JSON string of metadata dict"),
    public: z.boolean().optional(),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().updateAgent(params.agent_id, {
      name: params.name,
      personality: params.personality,
      mainResponsibilities: params.main_responsibilities,
      systemPrompt: params.system_prompt,
      whenToUse: params.when_to_use,
      metadataJson: params.metadata_json,
      projectId: projectId(),
      public: params.public,
    })
    return output(result)
  },
})

const DeleteAgentTool = Tool.define("deleteAgent", {
  description: "Delete an agent and clean up all associations. Permanent. Requires engagement_id.",
  parameters: z.object({
    agent_id: z.string().describe("Agent UUID to delete"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().deleteAgent(params.agent_id)
    return output(result)
  },
})

const GetAgentSkillsTool = Tool.define("getAgentSkills", {
  description: "Get lightweight skill overview for an agent (titles, summaries). First step of progressive disclosure.",
  parameters: z.object({
    agent_id: z.string().describe("Agent UUID"),
  }),
  async execute(params) {
    const result = await client().getAgentSkills(params.agent_id)
    return output(result)
  },
})

const SearchSkillDetailsTool = Tool.define("searchSkillDetails", {
  description:
    "Semantic search within a skill's chunks. Returns FULL CONTENT — often no second call needed. Preferred over getSkillSections.",
  parameters: z.object({
    expertise_id: z.string().describe("Expertise UUID from getAgentSkills"),
    query: z.string().describe("Natural language query"),
    limit: z.number().optional().default(5),
  }),
  async execute(params) {
    const result = await client().searchSkillDetails(params.expertise_id, params.query, params.limit)
    return output(result)
  },
})

const GetSkillSectionsTool = Tool.define("getSkillSections", {
  description: "Get sections for one expertise document. Fallback for browsing when you don't know what to search.",
  parameters: z.object({
    expertise_id: z.string().describe("Expertise UUID from getAgentSkills"),
  }),
  async execute(params) {
    const result = await client().getSkillSections(params.expertise_id)
    return output(result)
  },
})

const GetSkillContentTool = Tool.define("getSkillContent", {
  description: "Fetch full content of a specific skill section by chunk_id.",
  parameters: z.object({
    chunk_id: z.string().describe("Chunk UUID from getSkillSections or searchSkillDetails"),
  }),
  async execute(params) {
    const result = await client().getSkillContent(params.chunk_id)
    return output(result)
  },
})

const LinkAgentSkillTool = Tool.define("linkAgentSkill", {
  description: "Link an expertise document to an agent, making it a navigable skill. Requires engagement_id.",
  parameters: z.object({
    agent_id: z.string().describe("Agent UUID"),
    expertise_id: z.string().describe("Expertise UUID to link"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().linkAgentSkill(params.agent_id, params.expertise_id)
    return output(result)
  },
})

const UnlinkAgentSkillTool = Tool.define("unlinkAgentSkill", {
  description:
    "Remove a skill link from an agent. Does NOT delete the expertise, only the link. Requires engagement_id.",
  parameters: z.object({
    agent_id: z.string().describe("Agent UUID"),
    expertise_id: z.string().describe("Expertise UUID to unlink"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().unlinkAgentSkill(params.agent_id, params.expertise_id)
    return output(result)
  },
})

export const AgentTools = [
  CreateAgentTool,
  UpdateAgentTool,
  DeleteAgentTool,
  GetAgentSkillsTool,
  SearchSkillDetailsTool,
  GetSkillSectionsTool,
  GetSkillContentTool,
  LinkAgentSkillTool,
  UnlinkAgentSkillTool,
]
