import { Plugin } from "../plugin"
import { Share } from "../share/share"
import { Format } from "../format"
import { LSP } from "../lsp"
import { FileWatcher } from "../file/watcher"
import { File } from "../file"
import { Project } from "./project"
import { Bus } from "../bus"
import { Command } from "../command"
import { Instance } from "./instance"
import { Vcs } from "./vcs"
import { Log } from "@/util/log"
import { ShareNext } from "@/share/share-next"
import { Snapshot } from "../snapshot"
import { Truncate } from "../tool/truncation"
import { Config } from "../config/config"
import { initializeLegion } from "../legion"
import { DelegationTracker } from "../legion/delegation"
// import { SessionStatus } from "../session/status"
// import { Session } from "../session"
// import { MessageV2 } from "../session/message-v2"
// import { Identifier } from "../id/id"

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  await Plugin.init()

  // LEGION: bootstrap agent identity via gRPC so it's available before the first prompt.
  // Also injects agent context into process.env so the MCP server inherits it
  // and doesn't need a whoAmI() tool call to establish session context.
  //
  // SKIP re-initialization inside delegation subprocesses: headless.ts already
  // authenticated and configured the LEGION client. A second initializeLegion()
  // call with config from a different directory would close the active client
  // and replace it with one pointing at a potentially different server.
  const isDelegationSubprocess = !!process.env.LEGION_DELEGATION_ID
  const cfg = await Config.get()
  if (cfg.legion && !isDelegationSubprocess) {
    const legionResult = await initializeLegion({
      serverUrl: cfg.legion.url,
      companyId: process.env.LEGION_COMPANY_ID || cfg.legion.companyId,
      email: cfg.legion.email,
      password: cfg.legion.password,
    }).catch((err) => {
      Log.Default.warn("LEGION initialization failed — continuing without LEGION", {
        error: err instanceof Error ? err.message : String(err),
      })
      return undefined
    })

    // Propagate agent context to env so MCP servers inherit it at spawn time
    if (legionResult?.available) {
      const { getLegionIdentity } = await import("../legion")
      const identity = getLegionIdentity()
      if (identity?.raw) {
        if (identity.raw.agent_id) process.env.LEGION_AGENT_ID = identity.raw.agent_id
        if (cfg.legion.companyId) process.env.LEGION_COMPANY_ID = cfg.legion.companyId
      }
      // Start background delegation monitoring (F-029)
      DelegationTracker.start()

      // When a delegation completes, auto-trigger the LLM on any idle session
      // so the result is processed immediately without requiring user input.
      // The 1-minute idle guard ensures we only trigger if the user hasn't been
      // active recently — preventing interruption of an ongoing conversation.
      // Bus.subscribe(DelegationTracker.Event.ResultReady, async (event) => {
      //   const { delegationId, agentName } = event.properties
      //   Log.Default.info("delegation result ready — checking for idle session", {
      //     delegationId,
      //     agent: agentName,
      //   })

      //   // 1-minute idle guard: only auto-trigger if no user activity in last 1 minute
      //   if (!DelegationTracker.isIdle()) {
      //     Log.Default.info("delegation result: session not idle — result will be injected on next user message", {
      //       delegationId,
      //     })
      //     return
      //   }

      //   // Find the most recently updated session that is currently idle
      //   const idleSessions = [...Session.list()].filter((s) => SessionStatus.get(s.id).type === "idle")
      //   if (idleSessions.length === 0) {
      //     Log.Default.info("no idle session found — result will be injected on next user message", {
      //       delegationId,
      //     })
      //     return
      //   }

      //   // Target the most recently active idle session
      //   const target = idleSessions.reduce((a, b) => (a.time.updated > b.time.updated ? a : b))

      //   Log.Default.info("triggering LLM turn for idle session", {
      //     delegationId,
      //     sessionID: target.id,
      //   })

      //   // Import lazily to avoid circular dependency at module load time
      //   const { SessionPrompt } = await import("../session/prompt")
      //   try {
      //     SessionPrompt.assertNotBusy(target.id)

      //     // Option B: SessionPrompt.loop() exits early on idle sessions (prompt.ts:325-331)
      //     // when lastAssistant.finish is terminal and no new user message exists.
      //     // Fix: inject a synthetic user message so lastUser.id > lastAssistant.id,
      //     // which bypasses the early-exit guard. LLM.stream() then injects the
      //     // delegation results via DelegationTracker.getSystemPromptSection() (llm.ts:300-307).
      //     let lastUserAgent: string | undefined
      //     let lastUserModel: { providerID: string; modelID: string } | undefined
      //     for await (const msg of MessageV2.stream(target.id)) {
      //       if (msg.info.role === "user") {
      //         lastUserAgent = msg.info.agent
      //         lastUserModel = msg.info.model
      //       }
      //     }

      //     const syntheticUserMsg: MessageV2.User = {
      //       id: Identifier.ascending("message"),
      //       sessionID: target.id,
      //       role: "user",
      //       time: { created: Date.now() },
      //       agent: lastUserAgent ?? "build",
      //       model: lastUserModel ?? { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
      //     }
      //     await Session.updateMessage(syntheticUserMsg)
      //     await Session.updatePart({
      //       id: Identifier.ascending("part"),
      //       messageID: syntheticUserMsg.id,
      //       sessionID: target.id,
      //       type: "text",
      //       text: "Delegation results are ready. Review the <legion-delegations> section in the system context and act on any completed delegations.",
      //       synthetic: true,
      //     } satisfies MessageV2.TextPart)
      //     await Session.touch(target.id)

      //     await SessionPrompt.loop({ sessionID: target.id })
      //   } catch (err) {
      //     // Session became busy between the idle check and loop start — ignore
      //     Log.Default.info("session became busy before delegation result could be injected", {
      //       delegationId,
      //       sessionID: target.id,
      //       error: err instanceof Error ? err.message : String(err),
      //     })
      //   }
      // })

      // Initialize extraction pipeline — always active when LEGION is available
      const { ExtractionBuffer, ExtractionDrain } = await import("../extraction")
      ExtractionBuffer.init()
      ExtractionDrain.start()
    }
  }
  Share.init()
  ShareNext.init()
  Format.init()
  await LSP.init()
  FileWatcher.init()
  File.init()
  Vcs.init()
  Snapshot.init()
  Truncate.init()

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      await Project.setInitialized(Instance.project.id)
    }
  })
}
