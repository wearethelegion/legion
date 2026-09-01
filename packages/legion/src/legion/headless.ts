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
import { createLegionClient } from "@wearethelegion/sdk/v2"
import { Provider } from "../provider/provider"
import { ExtractionDrain } from "../extraction/drain"
import { authenticateLegion, getLegionClient } from "./auth"
import { bootstrapLegion } from "./bootstrap"
import { Log } from "../util/log"
import { randomUUID } from "crypto"
import {
  compileToolPolicy,
  costBudgetExceeded,
  normalizeCostBudget,
} from "./execution-guardrails"

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
    runId?: string
    taskId?: string
    ipcSock: string
    model?: string
    context?: string
    ownerId?: string
    maxTurns?: number
    timeoutSeconds?: number
    toolPolicy?: unknown
    costBudgetUsd?: number
  }

  export async function run(params: Params): Promise<void> {
    const started = Date.now()
    const ownerId = params.ownerId ?? `pid-${process.pid}`
    const maxTurns = Math.max(1, params.maxTurns ?? 50)
    const timeoutSeconds = Math.max(30, params.timeoutSeconds ?? 3600)
    const costBudgetUsd = normalizeCostBudget(params.costBudgetUsd)
    const ipc = await IpcClient.connect(params.ipcSock, params.delegationId)

    // Graceful shutdown on signals
    const shutdown = () => {
      ipc?.emitStatus("cancelled", "Process terminated")
      const legion = getLegionClient()
      if (legion) {
        legion
          .updateDelegationStatus(params.delegationId, "cancelled", {
            errorMessage: "Process terminated by signal",
            ownerId,
            objectiveStatus: "blocked",
            objectiveDetail: "Process terminated by signal",
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

    try {
      await bootstrap(params.targetPath, async () => {
        process.env.LEGION_ENGAGEMENT_ID = params.engagementId
        process.env.LEGION_DELEGATION_ID = params.delegationId
        process.env.LEGION_PROJECT_ID = params.projectId
        process.env.LEGION_AGENT_ID = params.agentId
        process.env.LEGION_COMPANY_ID = params.companyId
        if (params.runId) process.env.LEGION_AGENT_RUN_ID = params.runId
        process.env.LEGION_EXECUTION_ROOT_PATH = params.targetPath
        process.env.LEGION_EXECUTION_MAX_TURNS = String(maxTurns)
        process.env.LEGION_EXECUTION_TIMEOUT_SECONDS = String(timeoutSeconds)
        if (params.model) process.env.LEGION_EXECUTION_MODEL = params.model
        if (params.toolPolicy !== undefined) {
          process.env.LEGION_EXECUTION_TOOL_POLICY = JSON.stringify(params.toolPolicy)
        }
        if (costBudgetUsd !== undefined) {
          process.env.LEGION_EXECUTION_COST_BUDGET_USD = String(costBudgetUsd)
        }

        // ---------------------------------------------------------------
        // LEGION gRPC: authenticate and create delegation record
        // ---------------------------------------------------------------
        await authenticateLegion()

        // Never execute a business request under a generic/default persona.
        // The authenticated identity also supplies the approved project team
        // and role-specific system prompt used by bounded orchestration.
        const identity = await bootstrapLegion({
          agentId: params.agentId,
          companyId: params.companyId,
          projectId: params.projectId,
        })
        if (!identity) {
          throw new Error("The assigned LEGION agent identity could not be loaded")
        }
        if (identity.raw.agent_id && identity.raw.agent_id !== params.agentId) {
          throw new Error("The loaded LEGION agent identity does not match the assigned agent")
        }

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
          // Ownership must be established before any lifecycle mutation.
          // Web-dispatched jobs are already leased to this same owner; the
          // claim is therefore an idempotent fence check.
          const claim = await getLegionClient()!.claimDelegation(params.delegationId, ownerId)
          if (claim.status !== "success" || !claim.claimed) {
            throw new Error(claim.error_message || "Delegation ownership could not be established")
          }
          log.info("setting delegation to running", { delegationId: params.delegationId, ownerId })
          const running = await getLegionClient()!.updateDelegationStatus(params.delegationId, "running", {
            ownerId,
          })
          if (running.status !== "success") {
            throw new Error(running.error_message || "Delegation could not transition to running")
          }
          heartbeatInterval = setInterval(() => {
            getLegionClient()?.updateHeartbeat(params.delegationId, ownerId).catch((err) => {
              log.warn("heartbeat failed", {
                delegationId: params.delegationId,
                error: err instanceof Error ? err.message : String(err),
              })
            })
          }, 15_000) // every 15s
        }

        // Internal SDK client — same pattern as run.ts line 590-594
        // CRITICAL: pass directory so the server middleware uses the same Instance
        // as our bootstrap() call. Without this, Server.App middleware falls back to
        // process.cwd() which creates a NEW Instance + InstanceBootstrap, re-running
        // initializeLegion() with possibly different config — closing our LEGION client.
        const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init)
          return Server.App().fetch(request)
        }) as typeof globalThis.fetch
        const sdk = createLegionClient({
          baseUrl: "http://legion.internal",
          fetch: fetchFn,
          directory: params.targetPath,
        })

        ipc?.emitStatus("initializing")

        const rules = compileToolPolicy(params.toolPolicy)

        const session = await sdk.session.create({
          title: `Delegation: ${params.task.slice(0, 50)}`,
          permission: rules,
        })
        const sessionID = session.data?.id
        if (!sessionID) throw new Error("Failed to create session")

        let auditChain = Promise.resolve()
        const audit = (
          eventType: string,
          payload: Record<string, unknown> = {},
          toolCallId?: string,
        ) => {
          const legion = getLegionClient()
          if (!legion) return auditChain
          auditChain = auditChain
            .then(async () => {
              const response = await legion.appendDelegationEvent(params.delegationId, ownerId, {
                id: randomUUID(),
                delegation_id: params.delegationId,
                event_type: eventType,
                occurred_at: new Date().toISOString(),
                source: "legion-desktop",
                runtime: "legion-cli",
                run_id: params.runId,
                session_id: sessionID,
                tool_call_id: toolCallId,
                payload_json: JSON.stringify(payload),
                schema_version: 1,
              })
              if (response.status !== "success") {
                log.warn("audit event rejected", {
                  delegationId: params.delegationId,
                  eventType,
                  error: response.error_message || response.error_code,
                })
              }
            })
            .catch((eventError) => {
              log.warn("audit event write failed", {
                delegationId: params.delegationId,
                eventType,
                error: eventError instanceof Error ? eventError.message : String(eventError),
              })
            })
          return auditChain
        }
        void audit("run.started", { agent_id: params.agentId })

        // Build message: inject LEGION context so the delegated agent knows its engagement
        const legionContext = [
          `Your LEGION engagement_id is: ${params.engagementId}`,
          `Use this engagement_id in all addEntry, remember, and LEGION tool calls that require it.`,
          ...(params.runId && Number(process.env.LEGION_DELEGATION_DEPTH || "1") === 0
            ? [
                "You are the accountable team lead for this run. Delegate only when a listed specialist materially improves the outcome, wait for every child delegation to finish, inspect its result, and incorporate verified evidence before completing the parent request.",
              ]
            : []),
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
        let lastAssistantText = ""
        const toolsUsed = new Set<string>()
        let totalCost = 0
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
                void audit("tool.started", { tool: part.tool }, part.callID)
              }

              // tool_end — when tool completes successfully
              if (part.type === "tool" && part.state.status === "completed") {
                toolsUsed.add(part.tool)
                const startTime = toolTimers.get(part.callID) ?? part.state.time.start
                const duration = part.state.time.end - startTime
                const preview = part.state.output?.slice(0, 500)
                ipc?.emitToolEnd(part.tool, duration, true, preview)
                void audit(
                  "tool.completed",
                  { tool: part.tool, duration_ms: duration, step: stepCount + 1 },
                  part.callID,
                )
                toolTimers.delete(part.callID)
                stepCount++
                if (getLegionClient()) {
                  getLegionClient()!
                    .updateDelegationProgress(
                      params.delegationId,
                      `Tool: ${part.tool}`,
                      {
                        step: stepCount,
                        tool: part.tool,
                        input_summary: JSON.stringify(part.state.input).slice(0, 200),
                        timestamp: new Date().toISOString(),
                      },
                      ownerId,
                    )
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
                void audit(
                  "tool.failed",
                  { tool: part.tool, duration_ms: duration, error: part.state.error },
                  part.callID,
                )
                toolTimers.delete(part.callID)
              }

              // turn — when assistant text completes
              if (part.type === "text" && part.time?.end) {
                lastAssistantText = part.text.trim() || lastAssistantText
                turns++
                ipc?.emitTurn({
                  turn: turns,
                  role: "assistant",
                  contentPreview: part.text.slice(0, 500),
                  toolCallCount: toolsUsed.size,
                })
                void audit("turn.completed", { turn: turns, tool_count: toolsUsed.size })
                if (turns >= maxTurns) {
                  error = `Execution stopped after reaching the ${maxTurns}-turn policy limit`
                  await sdk.session.abort({ sessionID }).catch(() => {})
                }
              }

              // tokens + cost — when a step finishes
              if (part.type === "step-finish") {
                totalCost += part.cost
                ipc?.emitTokens({
                  turn: turns,
                  inputTokens: part.tokens.input,
                  outputTokens: part.tokens.output,
                  cacheReadTokens: part.tokens.cache.read,
                  cacheWriteTokens: part.tokens.cache.write,
                  turnCostUsd: part.cost,
                  totalCostUsd: totalCost,
                })
                if (!error && costBudgetExceeded(totalCost, costBudgetUsd)) {
                  error = `Execution stopped after exceeding the $${costBudgetUsd!.toFixed(4)} cost policy limit`
                  void audit("cost.limit_exceeded", {
                    cost_usd: totalCost,
                    cost_budget_usd: costBudgetUsd,
                  })
                  await sdk.session.abort({ sessionID }).catch(() => {})
                }
              }

              // action — when a new LLM step starts
              if (part.type === "step-start") {
                ipc?.emitAction("LLM step started")
              }
            }

            if (event.type === "message.updated") {
              const info = event.properties.info
              if (
                info.sessionID === sessionID &&
                info.role === "assistant" &&
                info.providerID &&
                info.modelID
              ) {
                getLegionClient()
                  ?.recordDelegationModel(
                    params.delegationId,
                    info.providerID,
                    info.modelID,
                    ownerId,
                  )
                  .catch(() => {})
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

        const timeoutTimer = setTimeout(() => {
          error = `Execution timed out after ${timeoutSeconds} seconds`
          sdk.session.abort({ sessionID }).catch(() => {})
        }, timeoutSeconds * 1000)

        try {
          await sdk.session.prompt({
            sessionID,
            model,
            parts: [{ type: "text", text: message }],
          })
          await loopDone
        } catch (promptError) {
          error = error || (promptError instanceof Error ? promptError.message : String(promptError))
          await sdk.session.abort({ sessionID }).catch(() => {})
          await loopDone
        } finally {
          clearTimeout(timeoutTimer)
        }

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
          await audit("run.failed", {
            turns,
            tool_count: tools.length,
            cost_usd: totalCost,
            duration_ms: duration,
          })
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
                ownerId,
                objectiveStatus: "blocked",
                objectiveDetail: error,
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
          const summary =
            lastAssistantText.slice(0, 50_000) ||
            `Completed in ${turns} turn(s), ${tools.length} tool(s) used, ${(duration / 1000).toFixed(1)}s`
          await audit("run.completed", {
            turns,
            tool_count: tools.length,
            cost_usd: totalCost,
            duration_ms: duration,
          })
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
                ownerId,
                objectiveStatus: "succeeded",
                objectiveDetail: summary,
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
            ownerId,
            objectiveStatus: "blocked",
            objectiveDetail: msg,
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
