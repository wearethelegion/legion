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

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  await Plugin.init()

  // LEGION: bootstrap agent identity via gRPC so it's available before the first prompt.
  // Also injects agent context into process.env so the MCP server inherits it
  // and doesn't need a whoAmI() tool call to establish session context.
  const cfg = await Config.get()
  if (cfg.legion) {
    const legionResult = await initializeLegion({
      serverUrl: cfg.legion.url,
      companyId: cfg.legion.companyId,
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

      // Initialize extraction pipeline only when per-turn extraction is enabled
      if (process.env.LEGION_EXTRACTION_ENABLED === "true") {
        const { ExtractionBuffer, ExtractionDrain } = await import("../extraction")
        ExtractionBuffer.init()
        ExtractionDrain.start()
      }
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
