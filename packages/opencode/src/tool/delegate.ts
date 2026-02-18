import z from "zod"
import path from "path"
import { spawn } from "child_process"
import { openSync } from "fs"
import { randomUUID } from "crypto"
import { Tool } from "./tool"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { Installation } from "../installation"
import { getLegionIdentity } from "../legion"
import { getLegionClient } from "../legion/auth"
import { companyId as getCompanyId, projectId as getProjectId } from "./legion/index"
import { IpcServer } from "../legion/ipc/server"
import type { StatusEvent } from "../legion/ipc/protocol"
import DESCRIPTION from "./delegate.txt"

const log = Log.create({ service: "tool.delegate" })

/** Active IPC servers keyed by delegation ID — cleaned up on child disconnect */
const servers = new Map<string, IpcServer>()

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
 * Compiled:    /path/to/legion delegate ...
 *
 * IMPORTANT: process.argv[1] may be worker.ts when running inside the TUI
 * Worker of a compiled binary — its bunfs path matches /\.[tj]sx?$/ even
 * though we're in compiled mode. We use Installation.isLocal() (a build-time
 * constant) instead of inspecting argv for reliable dev/compiled detection.
 */
/**
 * Resolve the opencode package root directory.
 * In dev mode: directory containing src/index.ts (two levels up from src/tool/)
 * In compiled mode: directory containing the binary
 */
function packageDir(): string {
  if (Installation.isLocal()) {
    return new URL("../..", import.meta.url).pathname
  }
  return path.dirname(process.execPath)
}

function command(args: string[]): string[] {
  if (Installation.isLocal()) {
    const indexPath = new URL("../index.ts", import.meta.url).pathname
    return [process.execPath, "--conditions=browser", indexPath, "--print-logs", "delegate", ...args]
  }
  return [process.execPath, "--print-logs", "delegate", ...args]
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
      const delegationCompanyId = getCompanyId()
      const delegationProjectId = getProjectId()

      const delegationId = randomUUID()
      const targetPath = params.target_path ?? Instance.directory

      // Create delegation record in LEGION BEFORE spawning child
      let serverDelegationId: string = delegationId
      const legionClient = getLegionClient()
      if (legionClient) {
        try {
          const resp = await legionClient.createDelegation({
            companyId: delegationCompanyId,
            agentId: params.agent_id,
            taskDescription: params.task,
            projectId: delegationProjectId || undefined,
            taskId: params.task_id,
            context: params.context,
            engagementId: params.engagement_id,
          })
          if (resp.delegation_id) {
            serverDelegationId = resp.delegation_id
            log.info("delegation pre-registered in LEGION", { delegationId: serverDelegationId })
          }
        } catch (err) {
          log.warn("failed to pre-register delegation in LEGION", {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      const socketPath = `/tmp/legion-deleg-${serverDelegationId}.sock`

      const args = [
        "--agent_id",
        params.agent_id,
        "--task",
        params.task,
        "--delegation_id",
        serverDelegationId,
        "--engagement_id",
        params.engagement_id,
        "--project_id",
        delegationProjectId,
        "--company_id",
        delegationCompanyId,
        "--target_path",
        targetPath,
        "--ipc_sock",
        socketPath,
      ]

      if (params.task_id) args.push("--task_id", params.task_id)
      if (params.model) args.push("--model", params.model)
      if (params.context) args.push("--context", params.context)

      const cmd = command(args)

      log.info("spawning delegation", {
        delegationId: serverDelegationId,
        agentId: params.agent_id,
        targetPath,
        projectId: delegationProjectId,
        companyId: delegationCompanyId,
      })

      // Start IPC server BEFORE spawning child so the socket is ready to accept
      let ipc: IpcServer | null = null
      try {
        ipc = await IpcServer.listen(socketPath)
        servers.set(serverDelegationId, ipc)

        ipc.onEvent((event) => {
          log.info("delegation event", {
            delegationId: serverDelegationId,
            type: event.type,
            agent: params.agent_id,
          })

          // Clean up server when delegation finishes
          if (event.type === "status") {
            const status = (event as StatusEvent).status
            if (status === "completed" || status === "failed" || status === "cancelled") {
              setTimeout(() => {
                const srv = servers.get(serverDelegationId)
                if (srv) {
                  srv.close()
                  servers.delete(serverDelegationId)
                  log.info("IPC server cleaned up", { delegationId: serverDelegationId })
                }
              }, 5000) // 5s grace for final events
            }
          }
        })
      } catch (err) {
        log.warn("failed to start IPC server — child will run in degraded mode", {
          delegationId: serverDelegationId,
          error: err instanceof Error ? err.message : String(err),
        })
      }

      const stderrLogPath = `/tmp/legion-deleg-${serverDelegationId}.stderr`
      const stderrFd = openSync(stderrLogPath, "w")
      const proc = spawn(cmd[0], cmd.slice(1), {
        cwd: packageDir(),
        stdio: ["ignore", "ignore", stderrFd],
        detached: process.platform !== "win32",
        env: { ...process.env },
      })

      // Detach child so parent can exit independently
      proc.unref()

      // Clean up IPC on process exit
      proc.on("exit", (code) => {
        log.info("delegation process exited", {
          delegationId: serverDelegationId,
          code: String(code ?? "unknown"),
        })
        const srv = servers.get(serverDelegationId)
        if (srv) {
          srv.close()
          servers.delete(serverDelegationId)
        }
      })

      if (!proc.pid) {
        if (ipc) {
          ipc.close()
          servers.delete(serverDelegationId)
        }
        throw new Error("Failed to spawn delegation subprocess")
      }

      const pid = proc.pid
      const label = agentLabel(params.agent_id)

      log.info("delegation spawned", {
        delegationId: serverDelegationId,
        agent: label,
        pid: String(pid),
      })

      const output = [
        `Delegation spawned successfully.`,
        ``,
        `delegation_id: ${serverDelegationId}`,
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
          delegationId: serverDelegationId,
          agentId: params.agent_id,
          pid,
          socketPath,
        },
        output,
      }
    },
  }
})
