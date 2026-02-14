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
import { ProviderTransform } from "@/provider/transform"
import { isLegionAvailable, getLegionClient } from "../legion/auth"
import { ExtractionBuffer } from "../extraction/buffer"
import { extractForCompaction } from "../extraction/extract"

export namespace SessionCompaction {
  const log = Log.create({ service: "session.compaction" })

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
        promoteToPermanent: true,
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

  export async function process(input: {
    parentID: string
    messages: MessageV2.WithParts[]
    sessionID: string
    abort: AbortSignal
    auto: boolean
  }) {
    // Try graph-based compaction first (no LLM call needed)
    if (isLegionAvailable()) {
      try {
        const result = await graphCompaction(input)
        if (result) return result
      } catch (err) {
        log.warn("graph compaction failed, falling back to LLM", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Fallback: original LLM-based compaction
    return llmCompaction(input)
  }

  /**
   * Graph-based compaction: query Neo4j for session knowledge,
   * keep last N raw turns, inject graph summary as the compaction message.
   * No LLM call — instant, structured, lossless.
   */
  async function graphCompaction(input: {
    parentID: string
    messages: MessageV2.WithParts[]
    sessionID: string
    abort: AbortSignal
    auto: boolean
  }): Promise<"continue" | "stop" | null> {
    const { GraphCompaction } = await import("../extraction")

    const summary = await GraphCompaction.buildSessionSummary({
      sessionId: input.sessionID,
    })

    if (!summary) return null // No graph data — fall back to LLM

    log.info("using graph-based compaction")

    const userMessage = input.messages.findLast((m) => m.info.id === input.parentID)!.info as MessageV2.User
    const agent = await Agent.get("compaction")
    const model = agent.model
      ? await Provider.getModel(agent.model.providerID, agent.model.modelID)
      : await Provider.getModel(userMessage.model.providerID, userMessage.model.modelID)

    // Create the compaction assistant message (summary: true marks the breakpoint)
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

    // Insert the graph summary as a text part — no LLM call needed
    await Session.updatePart({
      id: Identifier.ascending("part"),
      messageID: msg.id,
      sessionID: input.sessionID,
      type: "text",
      text: summary,
      time: {
        start: Date.now(),
        end: Date.now(),
      },
    })

    // Auto-continue: add synthetic "continue" user message
    if (input.auto) {
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
        text: "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.",
        time: {
          start: Date.now(),
          end: Date.now(),
        },
      })
    }

    // Fire-and-forget: extract structured data + save summary to LEGION
    runCompactionExtraction(input.sessionID, input.messages)
    saveToLegion(input.sessionID, summary)

    Bus.publish(Event.Compacted, { sessionID: input.sessionID })
    return "continue"
  }

  /**
   * Original LLM-based compaction (fallback when graph is unavailable).
   * Sends the full conversation to the compaction agent to produce a summary.
   */
  async function llmCompaction(input: {
    parentID: string
    messages: MessageV2.WithParts[]
    sessionID: string
    abort: AbortSignal
    auto: boolean
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
    // Allow plugins to inject context or replace compaction prompt
    const compacting = await Plugin.trigger(
      "experimental.session.compacting",
      { sessionID: input.sessionID },
      { context: [], prompt: undefined },
    )
    const defaultPrompt = `Produce a comprehensive session handoff prompt. This will be given to an agent in a NEW session with ZERO prior context — it must be fully self-contained.

The prompt must enable the next agent to resume work immediately without asking questions.

Use this exact template:
---
## Goal

[The user's overarching objective. Be specific — not "build a feature" but "build X that does Y for Z reason".]

## Instructions

- [Every instruction the user gave that is still relevant — preferences, constraints, conventions, tool usage rules]
- [If there is a plan, spec, or architecture doc, include its location and key points]
- [Agent IDs, project IDs, company IDs, engagement IDs — any UUIDs the next session needs]

## Discoveries

[Technical findings, architecture insights, edge cases found, decisions made and WHY. Include file paths and line numbers where relevant. This is institutional knowledge — don't lose it.]

## Accomplished

### Completed
- [Each completed task with enough detail to not redo it]

### In Progress
- [Anything partially done — what's done, what remains, blockers]

### Not Started
- [Remaining work items]

## Relevant files / directories

[Structured list of files read, edited, or created. Group by feature/component. Include line numbers for key locations. If all files in a directory are relevant, list the directory.]

## Current Blocker / Next Step

[The SINGLE most important thing the next agent should do first. Be actionable — not "continue work" but "fix the 3 typecheck errors in test/foo.ts lines 86, 127, 166 by removing the reason property".]
---`

    const promptText = compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")
    const result = await processor.process({
      user: userMessage,
      agent,
      abort: input.abort,
      sessionID: input.sessionID,
      tools: {},
      system: [],
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
        text: "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.",
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
