/**
 * Auto-Audit: Note Entry Creation for Modification Tools
 *
 * Fires an async LEGION entry (type: "note") after every Edit, Write, Bash, or
 * Delegate tool execution when an engagement is active. Rich content includes
 * diffs, command output, file paths, and delegation details.
 *
 * Fire-and-forget — never blocks the main response flow. All errors are
 * caught and logged silently.
 */

import { Log } from "../../util/log"

const log = Log.create({ service: "tool.audit" })

const AUDITED_TOOLS = new Set(["edit", "write", "bash", "delegate"])

const MAX_DIFF_LENGTH = 4000
const MAX_OUTPUT_LENGTH = 2000

/**
 * Dedup guard — tool.ts wraps execute() once per init() call, so the audit
 * hook can fire N times for a single tool invocation. This Set ensures
 * only the first call per unique key actually creates an entry.
 * Keys are evicted after the microtask fires to avoid unbounded growth.
 */
const inflight = new Set<string>()

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + "\n... (truncated)"
}

function formatEdit(
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): { title: string; content: string } {
  const filePath = (args.filePath as string) || "unknown"
  const diff = (result.diff as string) || ""
  const replaceAll = args.replaceAll ? " (replaceAll)" : ""
  return {
    title: `[Edit] ${filePath}${replaceAll}`,
    content: diff ? `\`\`\`diff\n${truncate(diff, MAX_DIFF_LENGTH)}\n\`\`\`` : `Edited ${filePath}`,
  }
}

function formatWrite(
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): { title: string; content: string } {
  const filePath = (args.filePath as string) || "unknown"
  const existed = result.exists as boolean
  const action = existed ? "updated" : "created"
  const content = args.content as string
  const size = content ? content.length : 0
  return {
    title: `[Write] ${filePath} (${action})`,
    content: `Wrote ${size} characters to \`${filePath}\``,
  }
}

function formatBash(
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): { title: string; content: string } {
  const command = (args.command as string) || ""
  const description = (args.description as string) || ""
  const workdir = (args.workdir as string) || ""
  const exitCode = result.exit as number
  const output = (result.output as string) || ""

  const header = description ? `[Bash] ${description}` : "[Bash]"
  const parts = [
    workdir ? `\`cwd: ${workdir}\`` : "",
    `\`\`\`bash\n$ ${command}\n\`\`\``,
    `Exit: ${exitCode ?? "unknown"}`,
    output ? `\`\`\`\n${truncate(output, MAX_OUTPUT_LENGTH)}\n\`\`\`` : "",
  ].filter(Boolean)

  return {
    title: header,
    content: parts.join("\n\n"),
  }
}

function formatDelegate(
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): { title: string; content: string } {
  const task = (args.task as string) || ""
  const agentId = (args.agent_id as string) || "unknown"
  const delegationId = (result.delegationId as string) || "unknown"
  const targetPath = (args.target_path as string) || ""
  const model = (args.model as string) || ""
  const context = (args.context as string) || ""
  const titleTask = task.length > 80 ? task.slice(0, 80) + "..." : task

  const parts = [
    `**Task:** ${task}`,
    `**Delegation ID:** \`${delegationId}\``,
    `**Agent ID:** \`${agentId}\``,
    targetPath ? `**Target Path:** \`${targetPath}\`` : "",
    model ? `**Model:** \`${model}\`` : "",
    context ? `**Context:**\n${context}` : "",
  ].filter(Boolean)

  return {
    title: `[Delegate] ${agentId} — ${titleTask}`,
    content: parts.join("\n\n"),
  }
}

const formatters: Record<
  string,
  (args: Record<string, unknown>, result: Record<string, unknown>) => { title: string; content: string }
> = {
  edit: formatEdit,
  write: formatWrite,
  bash: formatBash,
  delegate: formatDelegate,
}

/**
 * Should this tool execution be audited?
 * Skips delegation subprocesses — they track progress via IPC.
 */
export function shouldAudit(toolId: string, engagementId: string | null): boolean {
  if (process.env.LEGION_DELEGATION_ID) return false
  return AUDITED_TOOLS.has(toolId) && !!engagementId
}

/**
 * Fire an async note entry for a tool execution.
 * Never throws — all errors caught and logged.
 */
export function auditToolExecution(
  toolId: string,
  args: Record<string, unknown>,
  result: { metadata: Record<string, unknown> },
  engagementId: string,
  callId?: string,
): void {
  // Dedup: tool.ts wraps execute() N times (once per init call).
  // Without this guard, a single tool invocation creates N entries.
  const key = callId || `${toolId}-${Date.now()}`
  if (inflight.has(key)) return
  inflight.add(key)

  queueMicrotask(async () => {
    try {
      const formatter = formatters[toolId]
      if (!formatter) return

      const { title, content } = formatter(args, result.metadata)

      const { getLegionClient } = await import("../../legion/auth")
      const client = getLegionClient()
      if (!client) return

      await client.addEntry({
        engagementId,
        entryType: "note",
        title,
        content,
        tags: ["auto-audit", toolId],
      })

      log.debug("audit entry created", { tool: toolId, title })
    } catch (err) {
      log.warn("audit entry failed", {
        tool: toolId,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      inflight.delete(key)
    }
  })
}
