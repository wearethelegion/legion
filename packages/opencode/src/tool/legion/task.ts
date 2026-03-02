import z from "zod"
import { Tool } from "../tool"
import { client, output, projectId, companyId } from "./index"

const CreateTaskTool = Tool.define("createTask", {
  description: "Create a new task with optional assignment, priority, and engagement link. Requires engagement_id.",
  parameters: z.object({
    title: z.string().describe("Task title"),
    ultimate_goal: z.string().describe("Overarching objective (min 10 chars)"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
    description: z.string().optional(),
    priority: z.string().optional().default("medium").describe("low, medium, high, critical"),
    assigned_agent_id: z.string().optional(),
    created_by_agent_id: z.string().optional(),
  }),
  async execute(params) {
    const result = await client().createTask({
      title: params.title,
      ultimateGoal: params.ultimate_goal,
      projectId: projectId(),
      companyId: companyId(),
      engagementId: params.engagement_id,
      description: params.description,
      priority: params.priority,
      assignedAgentId: params.assigned_agent_id,
      createdByAgentId: params.created_by_agent_id,
    })
    return output(result)
  },
})

const GetTaskTool = Tool.define("getTask", {
  description: "Get task details with linked artifacts.",
  parameters: z.object({
    task_id: z.string().describe("Task UUID"),
  }),
  async execute(params) {
    const result = await client().getTask(params.task_id)
    return output(result)
  },
})

const ListTasksTool = Tool.define("listTasks", {
  description: "List tasks with optional filters (engagement, agent, status).",
  parameters: z.object({
    engagement_id: z.string().optional(),
    agent_id: z.string().optional(),
    status: z.string().optional().describe("pending, assigned, in_progress, blocked, completed"),
    limit: z.number().optional().default(50),
    offset: z.number().optional().default(0),
  }),
  async execute(params) {
    const result = await client().listTasks({
      projectId: projectId(),
      engagementId: params.engagement_id,
      agentId: params.agent_id,
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    })
    return output(result)
  },
})

const UpdateTaskTool = Tool.define("updateTask", {
  description: "Update task status, assignment, blockers, priority, or ultimate_goal. Requires engagement_id.",
  parameters: z.object({
    task_id: z.string().describe("Task UUID"),
    status: z.string().optional().describe("pending, assigned, in_progress, blocked, completed"),
    assigned_agent_id: z.string().optional(),
    blockers: z.string().optional(),
    priority: z.string().optional(),
    ultimate_goal: z.string().optional(),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().updateTask(params.task_id, {
      status: params.status,
      assignedAgentId: params.assigned_agent_id,
      blockers: params.blockers,
      priority: params.priority,
      ultimateGoal: params.ultimate_goal,
    })
    return output(result)
  },
})

const CompleteTaskTool = Tool.define("completeTask", {
  description: "Mark task as completed with timestamp. Requires engagement_id.",
  parameters: z.object({
    task_id: z.string().describe("Task UUID"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().completeTask(params.task_id)
    return output(result)
  },
})

const AssignTaskTool = Tool.define("assignTask", {
  description: "Assign task to an agent. Sets status to 'assigned'. Requires engagement_id.",
  parameters: z.object({
    task_id: z.string().describe("Task UUID"),
    agent_id: z.string().describe("Agent UUID to assign to"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().assignTask(params.task_id, params.agent_id)
    return output(result)
  },
})

const LinkArtifactTool = Tool.define("linkArtifact", {
  description:
    "Link an artifact (code, knowledge, expertise, lesson) to a task for traceability. Requires engagement_id.",
  parameters: z.object({
    task_id: z.string().describe("Task UUID"),
    artifact_type: z.string().describe("code, knowledge, expertise, lesson"),
    artifact_id: z.string().describe("Artifact UUID"),
    engagement_id: z
      .string()
      .optional()
      .describe(
        "LEGION engagement UUID — required for all mutation operations. Create one with createEngagement first.",
      ),
  }),
  async execute(params) {
    const result = await client().linkArtifact(params.task_id, params.artifact_type, params.artifact_id)
    return output(result)
  },
})

export const TaskTools = [
  CreateTaskTool,
  GetTaskTool,
  ListTasksTool,
  UpdateTaskTool,
  CompleteTaskTool,
  AssignTaskTool,
  LinkArtifactTool,
]
