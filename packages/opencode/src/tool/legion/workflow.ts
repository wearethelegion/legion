import z from "zod"
import { Tool } from "../tool"
import { client, output, companyId, projectId } from "./index"

const ActivateWorkflowTool = Tool.define("activateWorkflow", {
  description: "Fetch full workflow content by ID for activation.",
  parameters: z.object({
    workflow_id: z.string().describe("Workflow UUID"),
  }),
  async execute(params) {
    const result = await client().getWorkflowById(params.workflow_id)
    return output(result)
  },
})

const CreateWorkflowTool = Tool.define("createWorkflow", {
  description: "Create a new agent workflow with trigger signals. Requires engagement_id.",
  parameters: z.object({
    name: z.string().describe("Unique workflow name"),
    content: z.string().describe("Markdown workflow body with instructions"),
    signals: z.array(z.string()).describe("Trigger phrases that activate this workflow"),
    when_to_use: z.string().describe("When to activate this workflow"),
    description: z.string().optional(),
    role: z.string().optional(),
    agent_id: z.string().optional(),
    public: z.boolean().optional(),
    metadata_json: z.string().optional(),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().createWorkflow({
      companyId: companyId(),
      name: params.name,
      content: params.content,
      signals: params.signals,
      whenToUse: params.when_to_use,
      description: params.description,
      role: params.role,
      agentId: params.agent_id,
      projectId: projectId(),
      public: params.public,
      metadataJson: params.metadata_json,
    })
    return output(result)
  },
})

const UpdateWorkflowTool = Tool.define("updateWorkflow", {
  description: "Update an existing workflow. Only provided fields are changed. Requires engagement_id.",
  parameters: z.object({
    workflow_id: z.string().describe("Workflow UUID"),
    name: z.string().optional(),
    content: z.string().optional(),
    signals: z.array(z.string()).optional(),
    when_to_use: z.string().optional().describe("When to activate this workflow"),
    description: z.string().optional(),
    role: z.string().optional(),
    agent_id: z.string().optional(),
    public: z.boolean().optional(),
    metadata_json: z.string().optional(),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().updateWorkflow(params.workflow_id, {
      name: params.name,
      content: params.content,
      signals: params.signals,
      whenToUse: params.when_to_use,
      description: params.description,
      role: params.role,
      agentId: params.agent_id,
      projectId: projectId(),
      public: params.public,
      metadataJson: params.metadata_json,
    })
    return output(result)
  },
})

const DeleteWorkflowTool = Tool.define("deleteWorkflow", {
  description: "Delete a workflow by ID. Requires engagement_id.",
  parameters: z.object({
    workflow_id: z.string().describe("Workflow UUID"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().deleteWorkflow(params.workflow_id)
    return output(result)
  },
})

const ListWorkflowsTool = Tool.define("listWorkflows", {
  description: "List visible workflows with optional filters.",
  parameters: z.object({
    role: z.string().optional(),
    agent_id: z.string().optional(),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
  }),
  async execute(params) {
    const result = await client().listWorkflows({
      companyId: companyId(),
      role: params.role,
      agentId: params.agent_id,
      projectId: projectId(),
      limit: params.limit,
      offset: params.offset,
    })
    return output(result)
  },
})

export const WorkflowTools = [
  ActivateWorkflowTool,
  CreateWorkflowTool,
  UpdateWorkflowTool,
  DeleteWorkflowTool,
  ListWorkflowsTool,
]
