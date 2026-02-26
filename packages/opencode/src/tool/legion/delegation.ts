import z from "zod"
import { Tool } from "../tool"
import { client, output, projectId } from "./index"

const GetDelegationStatusTool = Tool.define("getDelegationStatus", {
  description: "Get status and progress of a delegation. Use after delegating to check progress.",
  parameters: z.object({
    delegation_id: z.string().describe("Delegation UUID"),
  }),
  async execute(params) {
    const result = await client().getDelegationStatus(params.delegation_id)
    const { progress: _progress, ...brief } = result as any
    return output(brief)
  },
})

const GetDelegationResultTool = Tool.define("getDelegationResult", {
  description: "Get full result of a completed delegation (summary, tools used, cost).",
  parameters: z.object({
    delegation_id: z.string().describe("Delegation UUID"),
  }),
  async execute(params) {
    const result = await client().getDelegationResult(params.delegation_id)
    return output(result)
  },
})

const ListDelegationsTool = Tool.define("listDelegations", {
  description: "List recent delegations with optional filters (agent, status).",
  parameters: z.object({
    agent_id: z.string().optional(),
    status_filter: z.string().optional().describe("pending, running, completed, failed, cancelled"),
    limit: z.number().optional().default(20),
    offset: z.number().optional().default(0),
  }),
  async execute(params) {
    const result = await client().listDelegations({
      projectId: projectId(),
      agentId: params.agent_id,
      statusFilter: params.status_filter,
      limit: params.limit,
      offset: params.offset,
    })
    return output(result)
  },
})

const CancelDelegationTool = Tool.define("cancelDelegation", {
  description: "Cancel a running delegation. Subprocess detects cancellation via heartbeat and exits gracefully.",
  parameters: z.object({
    delegation_id: z.string().describe("Delegation UUID to cancel"),
    engagement_id: z.string().optional().describe("LEGION engagement UUID for traceability"),
  }),
  async execute(params) {
    const result = await client().updateDelegationStatus(params.delegation_id, "cancelled")
    return output(result)
  },
})

export const DelegationTools = [
  GetDelegationStatusTool,
  GetDelegationResultTool,
  ListDelegationsTool,
  CancelDelegationTool,
]
