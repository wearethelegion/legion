/**
 * LEGION Project Context Loader (F-009)
 *
 * Loads project-specific context from LEGION: languages, frameworks,
 * tools, architecture notes, conventions, and custom instructions.
 *
 * Uses getAgentContext() for structured ProjectInstructions data,
 * since whoAmI's system_prompt bakes project context in but doesn't
 * expose it as structured fields at the gRPC proto level.
 */

import type { ProjectInstructions } from "@opencode-ai/legion-client"
import { getLegionClient } from "./auth"
import { getLegionIdentity } from "./bootstrap"
import { Log } from "../util/log"
import fs from "fs/promises"
import path from "path"

const log = Log.create({ service: "legion.project-context" })

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let cachedContext: ProjectInstructions | null = null
let formattedContext: string | null = null

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_FILE = path.join(".opencode", "cache", "legion-project-context.json")

function cachePath(baseDir?: string): string {
  return path.resolve(baseDir ?? process.cwd(), CACHE_FILE)
}

async function writeContextCache(
  context: ProjectInstructions,
  baseDir?: string,
): Promise<void> {
  const filePath = cachePath(baseDir)
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(context, null, 2), "utf-8")
  } catch (err) {
    log.warn("failed to cache project context", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function readContextCache(baseDir?: string): Promise<ProjectInstructions | null> {
  const filePath = cachePath(baseDir)
  try {
    const text = await fs.readFile(filePath, "utf-8")
    return JSON.parse(text) as ProjectInstructions
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format ProjectInstructions into a human-readable system prompt section.
 */
function formatProjectContext(instructions: ProjectInstructions): string {
  const sections: string[] = []

  sections.push("# Project Context (LEGION)")
  sections.push("")

  if (instructions.description) {
    sections.push(`## Description`)
    sections.push(instructions.description)
    sections.push("")
  }

  if (instructions.languages?.length) {
    sections.push(`## Languages`)
    sections.push(instructions.languages.join(", "))
    sections.push("")
  }

  if (instructions.frameworks?.length) {
    sections.push(`## Frameworks`)
    sections.push(instructions.frameworks.join(", "))
    sections.push("")
  }

  if (instructions.tools?.length) {
    sections.push(`## Tools`)
    sections.push(instructions.tools.join(", "))
    sections.push("")
  }

  if (instructions.architecture_notes) {
    sections.push(`## Architecture`)
    sections.push(instructions.architecture_notes)
    sections.push("")
  }

  if (instructions.conventions) {
    sections.push(`## Conventions`)
    sections.push(instructions.conventions)
    sections.push("")
  }

  if (instructions.custom_instructions) {
    sections.push(`## Custom Instructions`)
    sections.push(instructions.custom_instructions)
    sections.push("")
  }

  return sections.join("\n").trim()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ProjectContextOptions {
  /** LEGION agent UUID (required for getAgentContext call) */
  agentId?: string
  /** LEGION project UUID */
  projectId?: string
  /** Base directory for cache file */
  cacheDir?: string
}

/**
 * Load project context from LEGION.
 *
 * Strategy:
 * 1. Call getAgentContext() for structured ProjectInstructions
 * 2. Fall back to cached context if the call fails
 * 3. Returns null if no context available
 */
export async function loadProjectContext(
  opts: ProjectContextOptions = {},
): Promise<ProjectInstructions | null> {
  const client = getLegionClient()

  if (client && opts.agentId) {
    try {
      const response = await client.getAgentContext(opts.agentId, opts.projectId)

      if (response.status === "success" && response.project_instructions) {
        cachedContext = response.project_instructions
        formattedContext = formatProjectContext(cachedContext)

        // Cache for offline (fire-and-forget)
        writeContextCache(cachedContext, opts.cacheDir).catch(() => {})

        log.info("project context loaded", {
          projectId: cachedContext.project_id,
          languages: String(cachedContext.languages?.length ?? 0),
          frameworks: String(cachedContext.frameworks?.length ?? 0),
        })

        return cachedContext
      }

      if (response.error_message) {
        log.warn("getAgentContext returned error", {
          error: response.error_message,
        })
      }
    } catch (err) {
      log.warn("failed to load project context from LEGION", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Fallback to cache
  const cached = await readContextCache(opts.cacheDir)
  if (cached) {
    log.warn("using cached project context")
    cachedContext = cached
    formattedContext = formatProjectContext(cached)
    return cached
  }

  log.info("no project context available")
  return null
}

/**
 * Get the formatted project context string for system prompt injection.
 * Returns null if no context is loaded.
 */
export function getProjectContext(): string | null {
  return formattedContext
}

/**
 * Get the raw ProjectInstructions data.
 * Returns null if no context is loaded.
 */
export function getProjectInstructions(): ProjectInstructions | null {
  return cachedContext
}

/**
 * Clear in-memory project context. Does NOT delete cache file.
 */
export function clearProjectContext(): void {
  cachedContext = null
  formattedContext = null
}
