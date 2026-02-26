/**
 * Headless Execution Engine for LEGION Delegations
 *
 * Runs a full LLM conversation without TUI. Mirrors the pattern from
 * src/cli/cmd/run.ts but:
 *   - Working directory from params.targetPath (not process.cwd())
 *   - Initial message from params.task (with optional context prepended)
 *   - IPC events emitted via IpcClient when ipcSock is provided
 *   - SIGTERM/SIGINT handlers for graceful shutdown
 *   - LEGION gRPC integration: creates delegation record, updates status/progress
 */

import { IpcClient } from "./ipc/client"
import { bootstrap } from "../cli/bootstrap"
import { Server } from "../server/server"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Provider } from "../provider/provider"
import { PermissionNext } from "../permission/next"
import { ExtractionDrain } from "../extraction/drain"
import { authenticateLegion, getLegionClient } from "./auth"
// import { bootstrapLegion } from "./bootstrap"
import { Log } from "../util/log"

const log = Log.create({ service: "legion.headless" })

export namespace HeadlessMode {
  export interface Params {
    agentId: string
    task: string
    delegationId: string
    engagementId: string
    projectId: string
    targetPath: string
    companyId: string
    taskId?: string
    ipcSock: string
    model?: string
    context?: string
    // mcpConfig?: string
  }

  export async function run(params: Params): Promise<void> {
    const started = Date.now()
    const ipc = await IpcClient.connect(params.ipcSock, params.delegationId)

    // Graceful shutdown on signals
    const shutdown = () => {
      ipc?.emitStatus("cancelled", "Process terminated")
      const legion = getLegionClient()
      if (legion) {
        legion
          .updateDelegationStatus(params.delegationId, "cancelled", {
            errorMessage: "Process terminated by signal",
          })
          .catch((err) => {
            log.warn("failed to set delegation cancelled on signal", {
              delegationId: params.delegationId,
              error: err instanceof Error ? err.message : String(err),
            })
          })
      }
      ExtractionDrain.stop()
        .catch(() => {})
        .finally(() => {
          ipc?.close()
          process.exit(1)
        })
      setTimeout(() => process.exit(1), 3000)
    }
    process.on("SIGTERM", shutdown)
    process.on("SIGINT", shutdown)

    // Propagate parent MCP config to subprocess BEFORE bootstrap() so Config.state
    // // can pick it up during its single lazy-init pass.
    // if (params.mcpConfig) {
    //   process.env.OPENCODE_MCP_CONFIG_OVERRIDE = params.mcpConfig
    // }

    try {
      await bootstrap(params.targetPath, async () => {
        process.env.LEGION_ENGAGEMENT_ID = params.engagementId
        process.env.LEGION_DELEGATION_ID = params.delegationId
        process.env.LEGION_PROJECT_ID = params.projectId
        process.env.LEGION_AGENT_ID = params.agentId
        process.env.LEGION_COMPANY_ID = params.companyId

        // ---------------------------------------------------------------
        // LEGION gRPC: authenticate and create delegation record
        // ---------------------------------------------------------------
        await authenticateLegion()

        // Bootstrap agent identity so getLegionIdentity() returns the correct
        // persona/system_prompt for this delegated agent (not null).
        // if (getLegionClient()) {
        //   await bootstrapLegion({
        //     agentId: params.agentId,
        //     companyId: params.companyId,
        //     projectId: params.projectId,
        //   }).catch((err) => {
        //     log.warn("bootstrapLegion failed in delegation subprocess — agent will run without identity", {
        //       delegationId: params.delegationId,
        //       agentId: params.agentId,
        //       error: err instanceof Error ? err.message : String(err),
        //     })
        //   })
        // }

        if (!getLegionClient()) {
          log.warn(
            "LEGION client not available in delegation subprocess — status updates and progress tracking will be unavailable",
            {
              delegationId: params.delegationId,
              agentId: params.agentId,
            },
          )
        }

        // Heartbeat interval handle — must be accessible to completion handlers
        let heartbeatInterval: ReturnType<typeof setInterval> | undefined


        if (getLegionClient()) {
          log.info("setting delegation to running", { delegationId: params.delegationId })
          getLegionClient()!.updateDelegationStatus(params.delegationId, "running").then(() => {
            log.info("delegation set to running OK", { delegationId: params.delegationId })
          }).catch((err) => {
            log.warn("failed to set delegation running", {
              delegationId: params.delegationId,
              error: err instanceof Error ? err.message : String(err),
            })
          })

          // Claim ownership and start heartbeat so the server knows we're alive
          const ownerId = `pid-${process.pid}`
          getLegionClient()!.claimDelegation(params.delegationId, ownerId).catch((err) => {
            log.warn("failed to claim delegation", {
              delegationId: params.delegationId,
              error: err instanceof Error ? err.message : String(err),
            })
          })
          heartbeatInterval = setInterval(() => {
            getLegionClient()?.updateHeartbeat(params.delegationId, ownerId).catch((err) => {
              log.warn("heartbeat failed", {
                delegationId: params.delegationId,
                error: err instanceof Error ? err.message : String(err),
              })
            })
          }, 15_000) // every 15s
        }

        // if (getLegionClient()) {
        //   log.info("setting delegation to running", { delegationId: params.delegationId })
        //   getLegionClient()!
        //     .updateDelegationStatus(params.delegationId, "running")
        //     .then(() => {
        //       log.info("delegation set to running OK", { delegationId: params.delegationId })
        //     })
        //     .catch((err) => {
        //       log.warn("failed to set delegation running", {
        //         delegationId: params.delegationId,
        //         error: err instanceof Error ? err.message : String(err),
        //       })
        //     })

        //   // Claim ownership and start heartbeat so the server knows we're alive
        //   const ownerId = `pid-${process.pid}`
        //   getLegionClient()!
        //     .claimDelegation(params.delegationId, ownerId)
        //     .catch((err) => {
        //       log.warn("failed to claim delegation", {
        //         delegationId: params.delegationId,
        //         error: err instanceof Error ? err.message : String(err),
        //       })
        //     })
        //   heartbeatInterval = setInterval(() => {
        //     getLegionClient()
        //       ?.updateHeartbeat(params.delegationId, ownerId)
        //       .catch((err) => {
        //         log.warn("heartbeat failed", {
        //           delegationId: params.delegationId,
        //           error: err instanceof Error ? err.message : String(err),
        //         })
        //       })
        //   }, 15_000) // every 15s
        // }

        // Internal SDK client — same pattern as run.ts line 590-594
        // CRITICAL: pass directory so the server middleware uses the same Instance
        // as our bootstrap() call. Without this, Server.App middleware falls back to
        // process.cwd() which creates a NEW Instance + InstanceBootstrap, re-running
        // initializeLegion() with possibly different config — closing our LEGION client.
        const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init)
          return Server.App().fetch(request)
        }) as typeof globalThis.fetch
        const sdk = createOpencodeClient({
          baseUrl: "http://opencode.internal",
          fetch: fetchFn,
          directory: params.targetPath,
        })

        ipc?.emitStatus("initializing")

        // Delegations run autonomously — allow everything except interactive prompts
        const rules: PermissionNext.Ruleset = [
          { permission: "*", action: "allow", pattern: "*" },
          { permission: "question", action: "deny", pattern: "*" },
          { permission: "plan_enter", action: "deny", pattern: "*" },
          { permission: "plan_exit", action: "deny", pattern: "*" },
        ]

        const session = await sdk.session.create({
          title: `Delegation: ${params.task.slice(0, 50)}`,
          permission: rules,
        })
        const sessionID = session.data?.id
        if (!sessionID) throw new Error("Failed to create session")

        // Build message: inject LEGION context so the delegated agent knows its engagement
        const legionContext = [
          `Your LEGION engagement_id is: ${params.engagementId}`,
          `Use this engagement_id in all addEntry, remember, and LEGION tool calls that require it.`,
        ].join(". ")

        const message = params.context
          ? `${legionContext}\n\n${params.context}\n\n${params.task}`
          : `${legionContext}\n\n${params.task}`

        // Resolve model override
        const model = params.model ? Provider.parseModel(params.model) : undefined

        // Subscribe to SSE event stream
        const events = await sdk.event.subscribe()
        let error: string | undefined
        let turns = 0
        const toolsUsed = new Set<string>()
        let totalCost = 0
        let totalInputTokens = 0
        let totalOutputTokens = 0
        let totalCacheReadTokens = 0
        let totalCacheWriteTokens = 0
        let stepCount = 0
        const toolTimers = new Map<string, number>()

        ipc?.emitStatus("running")
        ipc?.emitConnected({
          agentId: params.agentId,
          agentName: params.agentId,
          agentRole: "delegation",
          model: params.model ?? "default",
          task: params.task,
          pid: process.pid,
        })

        // Handle cancel commands from parent via IPC
        ipc?.onCommand((cmd) => {
          if (cmd.type === "cancel") {
            sdk.session.abort({ sessionID }).catch(() => {})
          }
          if (cmd.type === "ping") {
            ipc?.emitPong()
          }
        })

        // Event loop — adapted from run.ts
        async function loop() {
          for await (const event of events.stream) {
            if (event.type === "message.part.updated") {
              const part = event.properties.part
              if (part.sessionID !== sessionID) continue

              // tool_start — when tool begins running
              if (part.type === "tool" && part.state.status === "running") {
                toolTimers.set(part.callID, part.state.time.start)
                ipc?.emitToolStart(part.tool, part.state.input as Record<string, unknown>)
              }

              // tool_end — when tool completes successfully
              if (part.type === "tool" && part.state.status === "completed") {
                toolsUsed.add(part.tool)
                const startTime = toolTimers.get(part.callID) ?? part.state.time.start
                const duration = part.state.time.end - startTime
                const preview = part.state.output?.slice(0, 500)
                ipc?.emitToolEnd(part.tool, duration, true, preview)
                toolTimers.delete(part.callID)
                stepCount++
                if (getLegionClient()) {
                  getLegionClient()!
                    .updateDelegationProgress(params.delegationId, `Tool: ${part.tool}`, {
                      step: stepCount,
                      tool: part.tool,
                      input_summary: JSON.stringify(part.state.input).slice(0, 200),
                      timestamp: new Date().toISOString(),
                    })
                    .catch((err) => {
                      log.warn("failed to update delegation progress", {
                        delegationId: params.delegationId,
                        step: String(stepCount),
                        tool: part.tool,
                        error: err instanceof Error ? err.message : String(err),
                      })
                    })
                }
              }

              // tool error — when tool fails
              if (part.type === "tool" && part.state.status === "error") {
                toolsUsed.add(part.tool)
                const startTime = toolTimers.get(part.callID) ?? part.state.time.start
                const duration = part.state.time.end - startTime
                ipc?.emitToolEnd(part.tool, duration, false, part.state.error)
                ipc?.emitError(`Tool ${part.tool} failed: ${part.state.error}`, true, "tool")
                toolTimers.delete(part.callID)
              }

              // turn — when assistant text completes
              if (part.type === "text" && part.time?.end) {
                turns++
                ipc?.emitTurn({
                  turn: turns,
                  role: "assistant",
                  contentPreview: part.text.slice(0, 500),
                  toolCallCount: toolsUsed.size,
                })
              }

              // tokens + cost — when a step finishes
              if (part.type === "step-finish") {
                totalCost += part.cost
                totalInputTokens += part.tokens.input
                totalOutputTokens += part.tokens.output
                totalCacheReadTokens += part.tokens.cache.read
                totalCacheWriteTokens += part.tokens.cache.write
                ipc?.emitTokens({
                  turn: turns,
                  inputTokens: part.tokens.input,
                  outputTokens: part.tokens.output,
                  cacheReadTokens: part.tokens.cache.read,
                  cacheWriteTokens: part.tokens.cache.write,
                  turnCostUsd: part.cost,
                  totalCostUsd: totalCost,
                })
              }

              // action — when a new LLM step starts
              if (part.type === "step-start") {
                ipc?.emitAction("LLM step started")
              }
            }

            if (event.type === "session.error") {
              const props = event.properties
              if (props.sessionID !== sessionID) continue
              const err =
                props.error && "data" in props.error && props.error.data && "message" in props.error.data
                  ? String(props.error.data.message)
                  : String(props.error?.name ?? "unknown")
              error = error ? `${error}\n${err}` : err
              ipc?.emitError(err, false, "llm")
            }

            if (
              event.type === "session.status" &&
              event.properties.sessionID === sessionID &&
              event.properties.status.type === "idle"
            ) {
              break
            }

            if (event.type === "permission.asked") {
              const permission = event.properties
              if (permission.sessionID !== sessionID) continue
              await sdk.permission.reply({
                requestID: permission.id,
                reply: "reject",
              })
            }
          }
        }

        // Start event loop, then send prompt
        const loopDone = loop().catch((e) => {
          error = e instanceof Error ? e.message : String(e)
        })

        await sdk.session.prompt({
          sessionID,
          model,
          parts: [{ type: "text", text: message }],
        })

        await loopDone

        // Flush extraction drain and emit final result via IPC
        await ExtractionDrain.stop().catch(() => {})
        if (heartbeatInterval) clearInterval(heartbeatInterval)

        const duration = Date.now() - started
        const tools = [...toolsUsed]
        log.info("delegation execution finished", {
          delegationId: params.delegationId,
          hasError: String(!!error),
          turns: String(turns),
          tools: String(tools.length),
          durationMs: String(duration),
        })

        if (error) {
          ipc?.emitStatus("failed", error)
          ipc?.emitResult({ summary: error, toolsUsed: tools, turns, costUsd: totalCost, durationMs: duration })
          if (getLegionClient()) {
            log.info("updating delegation status to failed", { delegationId: params.delegationId })
            try {
              const resp = await getLegionClient()!.updateDelegationStatus(params.delegationId, "failed", {
                resultSummary: error,
                toolsUsed: tools,
                turns,
                costUsd: totalCost,
                errorMessage: error,
              })
              log.info("delegation status updated to failed", {
                delegationId: params.delegationId,
                resp: JSON.stringify(resp),
              })
            } catch (err) {
              log.error("failed to set delegation status to failed", {
                delegationId: params.delegationId,
                error: err instanceof Error ? err.message : String(err),
              })
            }
          }
          process.exitCode = 1
        } else {
          const summary = `Completed in ${turns} turn(s), ${tools.length} tool(s) used, ${(duration / 1000).toFixed(1)}s`
          ipc?.emitStatus("completed")
          ipc?.emitResult({ summary, toolsUsed: tools, turns, costUsd: totalCost, durationMs: duration })
          if (getLegionClient()) {
            log.info("updating delegation status to completed", { delegationId: params.delegationId })
            try {
              const resp = await getLegionClient()!.updateDelegationStatus(params.delegationId, "completed", {
                resultSummary: summary,
                toolsUsed: tools,
                turns,
                costUsd: totalCost,
              })
              log.info("delegation status updated to completed", {
                delegationId: params.delegationId,
                resp: JSON.stringify(resp),
              })
            } catch (err) {
              log.error("failed to set delegation status to completed", {
                delegationId: params.delegationId,
                error: err instanceof Error ? err.message : String(err),
              })
            }
          }
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      ipc?.emitError(msg, false, "internal")
      ipc?.emitStatus("failed", msg)
      const legion = getLegionClient()
      if (legion) {
        await legion
          .updateDelegationStatus(params.delegationId, "failed", {
            errorMessage: msg,
          })
          .catch((statusErr) => {
            log.error("failed to set delegation status to failed (outer catch)", {
              delegationId: params.delegationId,
              error: statusErr instanceof Error ? statusErr.message : String(statusErr),
            })
          })
      }
      process.exitCode = 1
    } finally {
      ipc?.close()
    }
  }
}
