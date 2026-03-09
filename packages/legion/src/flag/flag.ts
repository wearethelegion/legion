function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

export namespace Flag {
  export const LEGION_AUTO_SHARE = truthy("LEGION_AUTO_SHARE")
  export const LEGION_GIT_BASH_PATH = process.env["LEGION_GIT_BASH_PATH"]
  export const LEGION_CONFIG = process.env["LEGION_CONFIG"]
  export declare const LEGION_CONFIG_DIR: string | undefined
  export const LEGION_CONFIG_CONTENT = process.env["LEGION_CONFIG_CONTENT"]
  export const LEGION_DISABLE_AUTOUPDATE = truthy("LEGION_DISABLE_AUTOUPDATE")
  export const LEGION_DISABLE_PRUNE = truthy("LEGION_DISABLE_PRUNE")
  export const LEGION_DISABLE_TERMINAL_TITLE = truthy("LEGION_DISABLE_TERMINAL_TITLE")
  export const LEGION_PERMISSION = process.env["LEGION_PERMISSION"]
  export const LEGION_DISABLE_DEFAULT_PLUGINS = truthy("LEGION_DISABLE_DEFAULT_PLUGINS")
  export const LEGION_DISABLE_LSP_DOWNLOAD = truthy("LEGION_DISABLE_LSP_DOWNLOAD")
  export const LEGION_ENABLE_EXPERIMENTAL_MODELS = truthy("LEGION_ENABLE_EXPERIMENTAL_MODELS")
  export const LEGION_DISABLE_AUTOCOMPACT = truthy("LEGION_DISABLE_AUTOCOMPACT")
  export const LEGION_DISABLE_MODELS_FETCH = truthy("LEGION_DISABLE_MODELS_FETCH")
  export const LEGION_DISABLE_CLAUDE_CODE = truthy("LEGION_DISABLE_CLAUDE_CODE")
  export const LEGION_DISABLE_CLAUDE_CODE_PROMPT =
    LEGION_DISABLE_CLAUDE_CODE || truthy("LEGION_DISABLE_CLAUDE_CODE_PROMPT")
  export const LEGION_DISABLE_CLAUDE_CODE_SKILLS =
    LEGION_DISABLE_CLAUDE_CODE || truthy("LEGION_DISABLE_CLAUDE_CODE_SKILLS")
  export const LEGION_DISABLE_EXTERNAL_SKILLS =
    LEGION_DISABLE_CLAUDE_CODE_SKILLS || truthy("LEGION_DISABLE_EXTERNAL_SKILLS")
  export declare const LEGION_DISABLE_PROJECT_CONFIG: boolean
  export const LEGION_FAKE_VCS = process.env["LEGION_FAKE_VCS"]
  export declare const LEGION_CLIENT: string
  export const LEGION_SERVER_PASSWORD = process.env["LEGION_SERVER_PASSWORD"]
  export const LEGION_SERVER_USERNAME = process.env["LEGION_SERVER_USERNAME"]
  export const LEGION_ENABLE_QUESTION_TOOL = truthy("LEGION_ENABLE_QUESTION_TOOL")

  // Experimental
  export const LEGION_EXPERIMENTAL = truthy("LEGION_EXPERIMENTAL")
  export const LEGION_EXPERIMENTAL_FILEWATCHER = truthy("LEGION_EXPERIMENTAL_FILEWATCHER")
  export const LEGION_EXPERIMENTAL_DISABLE_FILEWATCHER = truthy("LEGION_EXPERIMENTAL_DISABLE_FILEWATCHER")
  export const LEGION_EXPERIMENTAL_ICON_DISCOVERY =
    LEGION_EXPERIMENTAL || truthy("LEGION_EXPERIMENTAL_ICON_DISCOVERY")

  const copy = process.env["LEGION_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  export const LEGION_EXPERIMENTAL_DISABLE_COPY_ON_SELECT =
    copy === undefined ? process.platform === "win32" : truthy("LEGION_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const LEGION_ENABLE_EXA =
    truthy("LEGION_ENABLE_EXA") || LEGION_EXPERIMENTAL || truthy("LEGION_EXPERIMENTAL_EXA")
  export const LEGION_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("LEGION_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const LEGION_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("LEGION_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const LEGION_EXPERIMENTAL_OXFMT = LEGION_EXPERIMENTAL || truthy("LEGION_EXPERIMENTAL_OXFMT")
  export const LEGION_EXPERIMENTAL_LSP_TY = truthy("LEGION_EXPERIMENTAL_LSP_TY")
  export const LEGION_EXPERIMENTAL_LSP_TOOL = LEGION_EXPERIMENTAL || truthy("LEGION_EXPERIMENTAL_LSP_TOOL")
  export const LEGION_DISABLE_FILETIME_CHECK = truthy("LEGION_DISABLE_FILETIME_CHECK")
  export const LEGION_EXPERIMENTAL_PLAN_MODE = LEGION_EXPERIMENTAL || truthy("LEGION_EXPERIMENTAL_PLAN_MODE")
  export const LEGION_EXPERIMENTAL_MARKDOWN = truthy("LEGION_EXPERIMENTAL_MARKDOWN")
  export const LEGION_MODELS_URL = process.env["LEGION_MODELS_URL"]
  export const LEGION_MODELS_PATH = process.env["LEGION_MODELS_PATH"]

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for LEGION_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "LEGION_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("LEGION_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for LEGION_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "LEGION_CONFIG_DIR", {
  get() {
    return process.env["LEGION_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for LEGION_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "LEGION_CLIENT", {
  get() {
    return process.env["LEGION_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
