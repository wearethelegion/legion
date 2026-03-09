import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Session } from "."
import { Identifier } from "../id/id"
import { Instance } from "../project/instance"
import { Provider } from "../provider/provider"
import { MessageV2 } from "./message-v2"
import z from "zod"
import { Token } from "../util/token"
import { Log } from "../util/log"
import { SessionProcessor } from "./processor"
import { fn } from "@/util/fn"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { Config } from "@/config/config"
import type { Tool as AITool } from "ai"
import { ProviderTransform } from "@/provider/transform"
import { getLegionClient } from "../legion/auth"
import { ExtractionBuffer } from "../extraction/buffer"
import { extractForCompaction } from "../extraction/extract"

export namespace SessionCompaction {
  const log = Log.create({ service: "session.compaction" })

  /** Map of sessionID → agent-written continuation prompt for manual context resets */
  const manualPrompts = new Map<string, string>()

  /** Called by the reset_context tool to store the agent's own continuation prompt */
  export function setManualContinuationPrompt(sessionID: string, prompt: string): void {
    manualPrompts.set(sessionID, prompt)
  }

  const SYSTEM_REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g
  const LEGION_IDENTITY = /<legion-identity>[\s\S]*?<\/legion-identity>/g

  /**
   * Produce clean, deduplicated conversation text from raw session messages.
   * Strips system prompts, tool I/O bodies, synthetic parts, and compaction summaries.
   */
  export function cleanForExtraction(messages: MessageV2.WithParts[]): string {
    const seen = new Set<string>()
    const tools = new Map<string, string>()
    const lines: string[] = []

    for (const msg of messages) {
      if (msg.info.role === "assistant" && msg.info.summary) continue

      const role = msg.info.role === "user" ? "User" : "Assistant"

      for (const part of msg.parts) {
        if (part.type === "text") {
          if ("synthetic" in part && part.synthetic) continue
          const cleaned = part.text.replace(SYSTEM_REMINDER, "").replace(LEGION_IDENTITY, "").trim()
          if (!cleaned) continue
          if (seen.has(cleaned)) continue
          seen.add(cleaned)
          lines.push(`${role}: ${cleaned}`)
        }
        if (part.type === "tool") {
          const input = "input" in part.state ? part.state.input : {}
          const vals = Object.values(input)
          const arg = vals.length > 0 ? String(vals[0]) : ""
          const brief = arg.length > 80 ? arg.slice(0, 80) : arg
          const key = `${part.tool}:${brief}`
          tools.set(key, `[${part.tool}: ${brief}]`)
        }
      }
    }

    const toolLines = Array.from(tools.values())
    return [...lines, ...toolLines].join("\n")
  }

  function runCompactionExtraction(sessionID: string, messages: MessageV2.WithParts[]): void {
    const clean = cleanForExtraction(messages)
    if (!clean) return
    extractForCompaction(clean, "")
      .then((extraction) => {
        ExtractionBuffer.insert({ sessionId: sessionID, turnNumber: -1, extraction })
      })
      .catch(() => {})
  }

  const env = globalThis.process?.env ?? {}

  function saveToLegion(sessionID: string, text: string): void {
    const legion = getLegionClient()
    if (!legion) return
    const projectId = env.LEGION_PROJECT_ID
    const agentId = env.LEGION_AGENT_ID
    const engagementId = env.LEGION_ENGAGEMENT_ID
    if (!projectId || !agentId) return
    legion
      .remember({
        projectId,
        agentId,
        memoryKey: `session-handoff-${sessionID}`,
        content: text,
        engagementId: engagementId || undefined,
        // promoteToPermanent: false,
        memoryType: "instruction",
        importance: 8,
      })
      .catch(() => {})
  }

  export const Event = {
    Compacted: BusEvent.define(
      "session.compacted",
      z.object({
        sessionID: z.string(),
      }),
    ),
  }

  const COMPACTION_BUFFER = 20_000

  export async function isOverflow(input: { tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
    const config = await Config.get()
    if (config.compaction?.auto === false) return false
    const context = input.model.limit.context
    if (context === 0) return false

    const count =
      input.tokens.total ||
      input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write

    const reserved =
      config.compaction?.reserved ?? Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model))
    const usable = input.model.limit.input
      ? input.model.limit.input - reserved
      : context - ProviderTransform.maxOutputTokens(input.model)
    return count >= usable
  }

  export const PRUNE_MINIMUM = 20_000
  export const PRUNE_PROTECT = 40_000

  const PRUNE_PROTECTED_TOOLS = ["skill"]

  // goes backwards through parts until there are 40_000 tokens worth of tool
  // calls. then erases output of previous tool calls. idea is to throw away old
  // tool calls that are no longer relevant.
  export async function prune(input: { sessionID: string }) {
    const config = await Config.get()
    if (config.compaction?.prune === false) return
    log.info("pruning")
    const msgs = await Session.messages({ sessionID: input.sessionID })
    let total = 0
    let pruned = 0
    const toPrune = []
    let turns = 0

    loop: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
      const msg = msgs[msgIndex]
      if (msg.info.role === "user") turns++
      if (turns < 2) continue
      if (msg.info.role === "assistant" && msg.info.summary) break loop
      for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
        const part = msg.parts[partIndex]
        if (part.type === "tool")
          if (part.state.status === "completed") {
            if (PRUNE_PROTECTED_TOOLS.includes(part.tool)) continue

            if (part.state.time.compacted) break loop
            const estimate = Token.estimate(part.state.output)
            total += estimate
            if (total > PRUNE_PROTECT) {
              pruned += estimate
              toPrune.push(part)
            }
          }
      }
    }
    log.info("found", { pruned, total })
    if (pruned > PRUNE_MINIMUM) {
      for (const part of toPrune) {
        if (part.state.status === "completed") {
          part.state.time.compacted = Date.now()
          await Session.updatePart(part)
        }
      }
      log.info("pruned", { count: toPrune.length })
    }
  }

  /**
   * Extract the last N user/assistant exchanges as clean text.
   * Preserves the immediate working context so the agent knows
   * exactly what it was doing right before compaction.
   */
  function extractRecentTurns(messages: MessageV2.WithParts[], maxTurns = 5): string {
    const turns: string[] = []
    let count = 0

    for (let i = messages.length - 1; i >= 0 && count < maxTurns; i--) {
      const msg = messages[i]
      if (msg.info.role === "assistant" && (msg.info as MessageV2.Assistant).summary) continue

      const role = msg.info.role === "user" ? "User" : "Assistant"
      const texts: string[] = []

      for (const part of msg.parts) {
        if (part.type === "text") {
          if ("synthetic" in part && part.synthetic) continue
          const cleaned = part.text.replace(SYSTEM_REMINDER, "").replace(LEGION_IDENTITY, "").trim()
          if (cleaned) texts.push(cleaned)
        }
        if (part.type === "tool" && part.state.status === "completed") {
          const input = "input" in part.state ? part.state.input : {}
          const vals = Object.values(input)
          const arg = vals.length > 0 ? String(vals[0]) : ""
          const brief = arg.length > 120 ? arg.slice(0, 120) + "..." : arg
          texts.push(`[Tool: ${part.tool}(${brief})]`)
        }
      }

      if (texts.length > 0) {
        turns.unshift(`**${role}:** ${texts.join("\n")}`)
        if (msg.info.role === "user") count++
      }
    }

    return turns.join("\n\n")
  }

  /**
   * Build LEGION context block with active IDs for session resumption.
   */
  function buildLegionContext(): string {
    const lines: string[] = []
    const agentId = env.LEGION_AGENT_ID
    const projectId = env.LEGION_PROJECT_ID
    const engagementId = env.LEGION_ENGAGEMENT_ID
    const companyId = env.LEGION_COMPANY_ID

    if (agentId) lines.push(`- agent_id: ${agentId}`)
    if (projectId) lines.push(`- project_id: ${projectId}`)
    if (companyId) lines.push(`- company_id: ${companyId}`)
    if (engagementId) lines.push(`- engagement_id: ${engagementId}`)

    return lines.length > 0 ? lines.join("\n") : ""
  }

  export async function process(input: {
    parentID: string
    messages: MessageV2.WithParts[]
    sessionID: string
    abort: AbortSignal
    auto: boolean
    /** Parent session's system prompt for cache-safe compaction */
    system?: string[]
    /** Parent session's resolved tools for cache-safe compaction */
    tools?: Record<string, AITool>
    /** Parent session's agent for cache-aligned system prompt construction */
    parentAgent?: Agent.Info
  }) {
    return llmCompaction(input)
  }

  /**
   * LLM-based compaction with recent turn preservation.
   * Sends the full conversation to the compaction agent to produce a summary,
   * enhanced with the last 3-5 raw turns and LEGION resumption context.
   */
  async function llmCompaction(input: {
    parentID: string
    messages: MessageV2.WithParts[]
    sessionID: string
    abort: AbortSignal
    auto: boolean
    system?: string[]
    tools?: Record<string, AITool>
    parentAgent?: Agent.Info
  }): Promise<"continue" | "stop"> {
    const userMessage = input.messages.findLast((m) => m.info.id === input.parentID)!.info as MessageV2.User
    const agent = await Agent.get("compaction")
    const model = agent.model
      ? await Provider.getModel(agent.model.providerID, agent.model.modelID)
      : await Provider.getModel(userMessage.model.providerID, userMessage.model.modelID)
    const msg = (await Session.updateMessage({
      id: Identifier.ascending("message"),
      role: "assistant",
      parentID: input.parentID,
      sessionID: input.sessionID,
      mode: "compaction",
      agent: "compaction",
      variant: userMessage.variant,
      summary: true,
      path: {
        cwd: Instance.directory,
        root: Instance.worktree,
      },
      cost: 0,
      tokens: {
        output: 0,
        input: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: model.id,
      providerID: model.providerID,
      time: {
        created: Date.now(),
      },
    })) as MessageV2.Assistant
    const processor = SessionProcessor.create({
      assistantMessage: msg,
      sessionID: input.sessionID,
      model,
      abort: input.abort,
    })
    // Check if this is a manual reset (agent provided its own continuation prompt)
    const manualPrompt = manualPrompts.get(input.sessionID)
    if (manualPrompt) {
      manualPrompts.delete(input.sessionID)
      // Write the agent's own prompt directly as the summary message text — no LLM call needed
      await Session.updatePart({
        id: Identifier.ascending("part"),
        messageID: msg.id,
        sessionID: input.sessionID,
        type: "text",
        text: manualPrompt,
        synthetic: false,
        time: {
          start: Date.now(),
          end: Date.now(),
        },
      })
      msg.finish = "stop"
      msg.time.completed = Date.now()
      await Session.updateMessage(msg)

      const continueMsg = await Session.updateMessage({
        id: Identifier.ascending("message"),
        role: "user",
        sessionID: input.sessionID,
        time: {
          created: Date.now(),
        },
        agent: userMessage.agent,
        model: userMessage.model,
      })
      await Session.updatePart({
        id: Identifier.ascending("part"),
        messageID: continueMsg.id,
        sessionID: input.sessionID,
        type: "text",
        synthetic: true,
        text: `Context was reset. Your next prompt is above — use the LEGION IDs in it to restore your full context if needed. Execute the next step from your prompt.`,
        time: {
          start: Date.now(),
          end: Date.now(),
        },
      })

      runCompactionExtraction(input.sessionID, input.messages)
      saveToLegion(input.sessionID, manualPrompt)
      Bus.publish(Event.Compacted, { sessionID: input.sessionID })
      return "continue"
    }

    // Allow plugins to inject context or replace compaction prompt
    const compacting = await Plugin.trigger(
      "experimental.session.compacting",
      { sessionID: input.sessionID },
      { context: [], prompt: undefined },
    )
    const recentTurns = extractRecentTurns(input.messages)
    const legionContext = buildLegionContext()

    const defaultPrompt = `Your context is about to be reset. Write a next prompt for yourself so you can resume after waking up with ZERO memory.

Most of your work context is already stored in LEGION (engagement entries, knowledge, expertise, lessons, memories). You do NOT need to reproduce it — just capture the IDs to reconnect and anything NOT yet recorded.

${legionContext ? `## Known LEGION IDs (include these verbatim)\n${legionContext}` : "Extract ALL LEGION IDs mentioned in the conversation: engagement_id, task_id, agent_id, project_id, company_id."}

Write your next prompt with this structure:

---
## LEGION IDs
[Every UUID needed to resume. These let you call resumeEngagement(), getTask(), recall() to pull everything back from LEGION.]

## Goal
[One sentence: what the user wants and why.]

## Unrecorded state
[ONLY information that has NOT been saved to LEGION yet — recent decisions, findings, or context from the last few turns that weren't captured via addEntry/remember/recordLesson. If everything was recorded, say so.]

## Current state and next step
[What you were doing RIGHT NOW and the specific next action. Not "continue work" — be exact: "fix typecheck error in src/foo.ts:86, then run tests".]
---
${recentTurns ? `\n## Recent conversation (last 5 turns)\nPreserve any substance from these that isn't already in LEGION:\n\n${recentTurns}` : ""}`

    const promptText = compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")
    // Cache-safe compaction: use the parent session's system prompt, tools, and agent
    // so the API request prefix matches the parent conversation's cached prefix.
    // This enables cache hits when the compaction model matches the parent model.
    const result = await processor.process({
      user: userMessage,
      agent: input.parentAgent ?? agent,
      abort: input.abort,
      sessionID: input.sessionID,
      tools: input.tools ?? {},
      system: input.system ?? [],
      messages: [
        ...MessageV2.toModelMessages(input.messages, model),
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptText,
            },
          ],
        },
      ],
      model,
    })

    if (result === "continue" && input.auto) {
      const continueMsg = await Session.updateMessage({
        id: Identifier.ascending("message"),
        role: "user",
        sessionID: input.sessionID,
        time: {
          created: Date.now(),
        },
        agent: userMessage.agent,
        model: userMessage.model,
      })
      await Session.updatePart({
        id: Identifier.ascending("part"),
        messageID: continueMsg.id,
        sessionID: input.sessionID,
        type: "text",
        synthetic: true,
        text: `Context was reset. Your next prompt is above — use the LEGION IDs in it to restore your full context if needed, if you have enough information to act, then do so. 
        2. Execute the next step from your prompt. You already told yourself what to do.`,
        time: {
          start: Date.now(),
          end: Date.now(),
        },
      })
    }
    if (processor.message.error) return "stop"

    // Fire-and-forget: extract structured data + save summary to LEGION
    runCompactionExtraction(input.sessionID, input.messages)
    Session.messages({ sessionID: input.sessionID, limit: 5 })
      .then((recent) => {
        const compacted = recent.find((m) => m.info.id === msg.id)
        if (!compacted) return
        const text = compacted.parts
          .filter((p): p is MessageV2.TextPart => p.type === "text")
          .map((p) => p.text)
          .join("\n")
        if (text) saveToLegion(input.sessionID, text)
      })
      .catch(() => {})

    Bus.publish(Event.Compacted, { sessionID: input.sessionID })
    return "continue"
  }

  export const create = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      agent: z.string(),
      model: z.object({
        providerID: z.string(),
        modelID: z.string(),
      }),
      auto: z.boolean(),
    }),
    async (input) => {
      const msg = await Session.updateMessage({
        id: Identifier.ascending("message"),
        role: "user",
        model: input.model,
        sessionID: input.sessionID,
        agent: input.agent,
        time: {
          created: Date.now(),
        },
      })
      await Session.updatePart({
        id: Identifier.ascending("part"),
        messageID: msg.id,
        sessionID: msg.sessionID,
        type: "compaction",
        auto: input.auto,
      })
    },
  )
}
