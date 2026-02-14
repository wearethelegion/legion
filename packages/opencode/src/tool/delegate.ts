import z from "zod"
import { spawn } from "child_process"
import { randomUUID } from "crypto"
import { Tool } from "./tool"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { Config } from "../config/config"
import { getLegionIdentity } from "../legion"
import DESCRIPTION from "./delegate.txt"

const log = Log.create({ service: "tool.delegate" })

const parameters = z.object({
  agent_id: z.string().describe("LEGION agent UUID to delegate to"),
  task: z.string().describe("Clear description of what the agent should accomplish"),
  engagement_id: z.string().describe("LEGION engagement UUID for traceability"),
  target_path: z
    .string()
    .optional()
    .describe("Working directory for the agent. Defaults to current project directory."),
  task_id: z.string().optional().describe("LEGION task UUID to link this delegation to"),
  model: z
    .string()
    .optional()
    .describe('Model override in provider/model format (e.g. "anthropic/claude-sonnet-4-20250514")'),
  context: z.string().optional().describe("Additional context prepended to the task"),
})

/**
 * Build the CLI command array to spawn `opencode delegate`.
 *
 * Development: bun --conditions=browser ./src/index.ts delegate ...
 * Compiled:    /path/to/opencode delegate ...
 */
function command(args: string[]): string[] {
  const entry = process.argv[1]
  if (entry?.match(/\.[tj]sx?$/)) {
    return [process.execPath, "--conditions=browser", entry, "delegate", ...args]
  }
  return [process.execPath, "delegate", ...args]
}

/**
 * Resolve agent display label from LEGION identity cache.
 * Falls back to raw agent_id if identity is unavailable.
 */
function agentLabel(agentId: string): string {
  const identity = getLegionIdentity()
  const agent = identity?.raw.available_agents?.find((a) => a.agent_id === agentId)
  if (agent) return `${agent.name} (${agent.role})`
  return agentId
}

export const DelegateTool = Tool.define("delegate", async () => {
  return {
    description: DESCRIPTION,
    parameters,
    async execute(params: z.infer<typeof parameters>) {
      const config = await Config.get()
      const projectId = process.env.LEGION_PROJECT_ID ?? ""
      const companyId = process.env.LEGION_COMPANY_ID ?? config.legion?.companyId ?? ""

      if (!companyId) {
        throw new Error(
          "LEGION company_id not available. Set LEGION_COMPANY_ID env var or configure legion.companyId in config.",
        )
      }

      const delegationId = randomUUID()
      const socketPath = `/tmp/legion-deleg-${delegationId}.sock`
      const targetPath = params.target_path ?? Instance.directory

      const args = [
        "--agent-id",
        params.agent_id,
        "--task",
        params.task,
        "--delegation-id",
        delegationId,
        "--engagement-id",
        params.engagement_id,
        "--project-id",
        projectId,
        "--company-id",
        companyId,
        "--target-path",
        targetPath,
        "--ipc-sock",
        socketPath,
      ]

      if (params.task_id) args.push("--task-id", params.task_id)
      if (params.model) args.push("--model", params.model)
      if (params.context) args.push("--context", params.context)

      const cmd = command(args)

      log.info("spawning delegation", {
        delegationId,
        agentId: params.agent_id,
        targetPath,
      })

      const proc = spawn(cmd[0], cmd.slice(1), {
        cwd: targetPath,
        stdio: ["ignore", "ignore", "ignore"],
        detached: process.platform !== "win32",
        env: { ...process.env },
      })

      // Detach child so parent can exit independently
      proc.unref()

      if (!proc.pid) {
        throw new Error("Failed to spawn delegation subprocess")
      }

      const pid = proc.pid
      const label = agentLabel(params.agent_id)

      log.info("delegation spawned", {
        delegationId,
        agent: label,
        pid: String(pid),
      })

      const output = [
        `Delegation spawned successfully.`,
        ``,
        `delegation_id: ${delegationId}`,
        `agent: ${label}`,
        `pid: ${pid}`,
        `socket: ${socketPath}`,
        ``,
        `The delegation is now running in a separate process.`,
        `Results will be automatically injected into your system prompt when complete.`,
        `You do NOT need to poll — continue with other work.`,
      ].join("\n")

      return {
        title: `Delegated to ${label}`,
        metadata: {
          delegationId,
          agentId: params.agent_id,
          pid,
          socketPath,
        },
        output,
      }
    },
  }
})
