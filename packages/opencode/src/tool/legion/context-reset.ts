import z from "zod"
import { Tool } from "../tool"
import { SessionCompaction } from "../../session/compaction"
import { MessageV2 } from "../../session/message-v2"

export const ContextResetTool = Tool.define("context_reset", {
  description: `Reset the conversation context window.
Call this when context usage exceeds 70% to preserve quality, or any time you need a fresh context.

The \`next_prompt\` you write becomes your first message in the new context — write it as a comprehensive self-briefing so you can resume immediately with no memory loss.

Structure your next_prompt as:
---
## LEGION IDs
[All UUIDs needed to resume: engagement_id, task_id, agent_id, project_id, company_id]

## Goal
[One sentence: what the user wants and why]

## Unrecorded state
[ONLY info NOT yet saved to LEGION. If everything is recorded, say so.]

## Current state and next step
[Exact action to take next — not "continue", be specific: "fix typecheck error in src/foo.ts:86, then run tests"]
---`,
  parameters: z.object({
    next_prompt: z
      .string()
      .describe(
        "Comprehensive continuation prompt you write for yourself. This becomes your first message in the fresh context.",
      ),
  }),
  async execute(params, ctx) {
    // Register the agent-written prompt so compaction skips LLM summarization
    SessionCompaction.setManualContinuationPrompt(ctx.sessionID, params.next_prompt)

    // Find the last user message to extract agent/model for compaction task creation
    const lastUser = ctx.messages
      .slice()
      .reverse()
      .find((m): m is MessageV2.WithParts & { info: MessageV2.User } => m.info.role === "user")

    if (!lastUser) {
      throw new Error("No user message found in session — cannot schedule context reset")
    }

    const userInfo = lastUser.info as MessageV2.User

    // Schedule the compaction — the prompt loop will pick up this compaction part
    // on the next iteration and invoke SessionCompaction.process(), which will
    // find the manual prompt and use it directly without an LLM call.
    await SessionCompaction.create({
      sessionID: ctx.sessionID,
      agent: userInfo.agent,
      model: userInfo.model,
      auto: false,
    })

    return {
      title: "Context reset scheduled",
      output: "Context reset scheduled. Your next_prompt will be injected as the first message of the fresh context.",
      metadata: {},
    }
  },
})

export const ContextResetTools = [ContextResetTool]
