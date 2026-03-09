import { Ripgrep } from "../file/ripgrep"

import { Instance } from "../project/instance"

import PROMPT_LEGION_BASE from "./prompt/legion-base.txt"
import PROMPT_CODEX from "./prompt/codex_header.txt"
import { Provider } from "@/provider/provider"

export namespace SystemPrompt {
  export function instructions() {
    return PROMPT_CODEX.trim()
  }

  export function provider(model: Provider.Model) {
    // LEGION base prompt → then mind's prompt (legion-identity) is injected in llm.ts
    return [PROMPT_LEGION_BASE]
  }

  export async function environment(model: Provider.Model, sessionID?: string) {
    const project = Instance.project

    const modelLines: string[] = []
    try {
      const providers = await Provider.list()
      const entries: { line: string; isCurrent: boolean }[] = []
      for (const [providerID, info] of Object.entries(providers)) {
        for (const [modelID, m] of Object.entries(info.models)) {
          const isCurrent = providerID === model.providerID && modelID === model.api.id
          entries.push({
            line: `- ${providerID}/${modelID} (${m.name})${isCurrent ? " [current]" : ""}`,
            isCurrent,
          })
        }
      }
      entries.sort((a, b) => {
        if (a.isCurrent) return -1
        if (b.isCurrent) return 1
        return a.line.localeCompare(b.line)
      })
      modelLines.push(`Available models for delegation:`, ...entries.map((e) => e.line))
    } catch {
      // silently skip if Provider.list() fails
    }

    return [
      [
        `You are Legion mind. You are here to help the user with tasks.`,
        `You are operating in OpenCode based Legion CLI`,
        `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
        ...(modelLines.length > 0 ? modelLines : []),
        `You never do anything without clear understanding of the user's request and the context.`,
        `Here is some useful information about the environment you are running in:`,
        `<env>`,
        `  Working directory: ${Instance.directory}`,
        `  Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}`,
        `  Platform: ${process.platform}`,
        `  Today's date: ${new Date().toDateString()}`,
        ...(sessionID ? [`  Session ID: ${sessionID}`] : []),
        `</env>`,
        `<directories>`,
        `  ${
          project.vcs === "git" && false
            ? await Ripgrep.tree({
                cwd: Instance.directory,
                limit: 50,
              })
            : ""
        }`,
        `</directories>`,
      ].join("\n"),
    ]
  }
}
