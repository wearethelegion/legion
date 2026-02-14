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
          .catch(() => {})
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

        // ---------------------------------------------------------------
        // LEGION gRPC: authenticate and create delegation record
        // ---------------------------------------------------------------
        await authenticateLegion()
        const legion = getLegionClient()
        let delegationId = params.delegationId

        if (legion) {
          try {
            const resp = await legion.createDelegation({
              companyId: params.companyId,
              agentId: params.agentId,
              taskDescription: params.task,
              projectId: params.projectId,
              taskId: params.taskId,
              context: params.context,
            })
            if (resp.delegation_id) {
              delegationId = resp.delegation_id
              log.info("delegation registered in LEGION", { delegationId })
            }
          } catch (err) {
            log.warn("failed to create delegation in LEGION — continuing", {
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }

        if (legion) {
          legion.updateDelegationStatus(delegationId, "running").catch(() => {})
        }

        // Internal SDK client — same pattern as run.ts line 590-594
        const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init)
          return Server.App().fetch(request)
        }) as typeof globalThis.fetch
        const sdk = createOpencodeClient({ baseUrl: "http://opencode.internal", fetch: fetchFn })

        ipc?.emitStatus("initializing")

        // Deny interactive permissions (plan, question)
        const rules: PermissionNext.Ruleset = [
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

        // Build message: optional context + task
        const message = params.context ? `${params.context}\n\n${params.task}` : params.task

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
                if (legion) {
                  legion
                    .updateDelegationProgress(delegationId, `Tool: ${part.tool}`, {
                      step: stepCount,
                      tool: part.tool,
                      input_summary: JSON.stringify(part.state.input).slice(0, 200),
                      timestamp: new Date().toISOString(),
                    })
                    .catch(() => {})
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

        const duration = Date.now() - started
        const tools = [...toolsUsed]
        if (error) {
          ipc?.emitStatus("failed", error)
          ipc?.emitResult({ summary: error, toolsUsed: tools, turns, costUsd: totalCost, durationMs: duration })
          if (legion) {
            await legion
              .updateDelegationStatus(delegationId, "failed", {
                resultSummary: error,
                toolsUsed: tools,
                turns,
                costUsd: totalCost,
                errorMessage: error,
              })
              .catch(() => {})
          }
          process.exitCode = 1
        } else {
          const summary = `Completed in ${turns} turn(s), ${tools.length} tool(s) used, ${(duration / 1000).toFixed(1)}s`
          ipc?.emitStatus("completed")
          ipc?.emitResult({ summary, toolsUsed: tools, turns, costUsd: totalCost, durationMs: duration })
          if (legion) {
            await legion
              .updateDelegationStatus(delegationId, "completed", {
                resultSummary: summary,
                toolsUsed: tools,
                turns,
                costUsd: totalCost,
              })
              .catch(() => {})
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
          .catch(() => {})
      }
      process.exitCode = 1
    } finally {
      ipc?.close()
    }
  }
}
