/**
 * Local Legion runner for Agent Workspace jobs.
 *
 * The runner establishes only outbound authenticated gRPC calls, atomically
 * leases work for the selected project, and executes it through the same
 * headless command used by in-product delegation. No browser-supplied path is
 * trusted: projects resolve through the local mapping or current workspace.
 */

import { randomUUID } from "crypto"
import { closeSync, openSync, existsSync, statSync } from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { spawn } from "child_process"
import { Installation } from "../installation"
import { Log } from "../util/log"
import { getLegionClient } from "./auth"
import { IpcServer } from "./ipc/server"
import { delegationProcessOptions } from "../tool/delegation-process"
import type { DelegationJob } from "@wearethelegion/legion-client"

const log = Log.create({ service: "legion.web-runner" })
const POLL_MS = 5_000

let timer: ReturnType<typeof setTimeout> | undefined
let selectedProjectId: string | undefined
let selectedCompanyId: string | undefined
let fallbackTargetPath: string | undefined
let stopped = true
let polling = false
const active = new Map<string, ReturnType<typeof spawn>>()

function packageDir(): string {
  if (Installation.isLocal()) return fileURLToPath(new URL("../..", import.meta.url))
  return path.dirname(process.execPath)
}

function command(args: string[]): string[] {
  if (Installation.isLocal()) {
    const indexPath = fileURLToPath(new URL("../index.ts", import.meta.url))
    return [process.execPath, "--conditions=browser", indexPath, "--print-logs", "delegate", ...args]
  }
  return [process.execPath, "--print-logs", "delegate", ...args]
}

function projectPath(projectId: string): string {
  const raw = process.env.LEGION_PROJECT_PATHS
  if (raw) {
    try {
      const mapping = JSON.parse(raw) as Record<string, string>
      if (mapping[projectId]) return path.resolve(mapping[projectId])
    } catch (error) {
      log.warn("invalid LEGION_PROJECT_PATHS mapping", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return path.resolve(process.env.LEGION_RUNNER_TARGET_PATH || fallbackTargetPath || process.cwd())
}

function schedule(delay = POLL_MS) {
  if (stopped) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void poll(), delay)
}

async function failClaimedJob(delegationId: string, ownerId: string, message: string) {
  await getLegionClient()
    ?.updateDelegationStatus(delegationId, "failed", {
      ownerId,
      errorMessage: message,
      objectiveStatus: "blocked",
      objectiveDetail: message,
    })
    .catch(() => {})
}

async function launch(job: DelegationJob, ownerId: string) {
  const targetPath = projectPath(job.project_id)
  if (!existsSync(targetPath) || !statSync(targetPath).isDirectory()) {
    await failClaimedJob(
      job.delegation_id,
      ownerId,
      `Runner workspace is unavailable for project ${job.project_id}: ${targetPath}`,
    )
    return
  }

  const socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\legion-web-${job.delegation_id}`
      : path.join(os.tmpdir(), `legion-web-${job.delegation_id}.sock`)
  let ipc: IpcServer | undefined
  try {
    ipc = await IpcServer.listen(socketPath)
  } catch (error) {
    log.warn("runner IPC unavailable; worker will use server telemetry", {
      delegationId: job.delegation_id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const args = [
    "--agent_id",
    job.agent_id,
    "--task",
    job.task,
    "--delegation_id",
    job.delegation_id,
    "--engagement_id",
    job.engagement_id,
    "--project_id",
    job.project_id,
    "--company_id",
    job.company_id,
    "--run_id",
    job.run_id,
    "--target_path",
    targetPath,
    "--ipc_sock",
    socketPath,
    "--owner_id",
    ownerId,
    "--max_turns",
    String(job.max_turns || 50),
    "--timeout_seconds",
    String(job.timeout_seconds || 3600),
  ]
  if (job.task_id) args.push("--task_id", job.task_id)
  if (job.model) args.push("--model", `${job.provider ? `${job.provider}/` : ""}${job.model}`)
  if (job.context) args.push("--context", job.context)
  try {
    const snapshot = JSON.parse(job.execution_snapshot_json || "{}") as {
      tool_policy?: unknown
    }
    if (snapshot.tool_policy) args.push("--tool_policy", JSON.stringify(snapshot.tool_policy))
  } catch {
    await failClaimedJob(job.delegation_id, ownerId, "The snapshotted execution policy is invalid JSON")
    ipc?.close()
    return
  }

  const cmd = command(args)
  const stderrPath = path.join(os.tmpdir(), `legion-web-${job.delegation_id}.stderr`)
  const stderrFd = openSync(stderrPath, "w")
  let proc: ReturnType<typeof spawn> | undefined
  try {
    proc = spawn(cmd[0], cmd.slice(1), {
      cwd: packageDir(),
      stdio: ["ignore", "ignore", stderrFd],
      ...delegationProcessOptions(),
      env: {
        ...process.env,
        // Mark the child before bootstrap. Without this fence it inherits the
        // selected project and can start another background runner itself.
        LEGION_DELEGATION_ID: job.delegation_id,
        LEGION_ENGAGEMENT_ID: job.engagement_id,
        LEGION_PROJECT_ID: job.project_id,
        LEGION_COMPANY_ID: job.company_id,
        LEGION_AGENT_ID: job.agent_id,
        LEGION_AGENT_RUN_ID: job.run_id,
        LEGION_DELEGATION_DEPTH: "0",
      },
    })
  } catch (error) {
    ipc?.close()
    await failClaimedJob(
      job.delegation_id,
      ownerId,
      `Legion runner could not start the agent process: ${error instanceof Error ? error.message : String(error)}`,
    )
    return
  } finally {
    // spawn duplicates the descriptor for the child. The long-running desktop
    // runner must release its own copy after every launch.
    closeSync(stderrFd)
  }
  if (!proc) return
  if (!proc.pid) {
    ipc?.close()
    await failClaimedJob(job.delegation_id, ownerId, "Legion runner failed to spawn the agent process")
    return
  }
  active.set(job.delegation_id, proc)
  proc.unref()
  log.info("web delegation started", {
    delegationId: job.delegation_id,
    runId: job.run_id,
    projectId: job.project_id,
    pid: String(proc.pid),
  })
  proc.on("error", (error) => {
    void failClaimedJob(job.delegation_id, ownerId, `Agent process error: ${error.message}`)
  })
  proc.on("exit", (code, signal) => {
    active.delete(job.delegation_id)
    ipc?.close()
    log.info("web delegation process exited", {
      delegationId: job.delegation_id,
      code: String(code ?? ""),
      signal: signal ?? "",
    })
    // A hard crash can occur before the headless worker writes its terminal
    // status. Reconcile it here while preserving a successful/terminal write.
    void getLegionClient()
      ?.getDelegationStatusBrief(job.delegation_id)
      .then((status) => {
        if (
          status.status === "success" &&
          !["completed", "failed", "cancelled", "interrupted"].includes(status.delegation_status)
        ) {
          return failClaimedJob(
            job.delegation_id,
            ownerId,
            `Agent process exited before completion${signal ? ` (${signal})` : ` (code ${code ?? "unknown"})`}`,
          )
        }
      })
      .catch(() => {})
    schedule(250)
  })
}

async function poll() {
  if (stopped || polling || !selectedProjectId) return
  const client = getLegionClient()
  if (!client) return schedule()
  const maxParallel = Math.max(1, Number(process.env.LEGION_RUNNER_CONCURRENCY || 2))
  if (active.size >= maxParallel) return schedule()

  polling = true
  try {
    const ownerId = `runner-${os.hostname()}-${process.pid}-${randomUUID()}`
    const capabilities = WebDelegationRunner.capabilities()
    const response = await client.claimPendingDelegation({
      projectId: selectedProjectId,
      ownerId,
      ...capabilities,
    })
    if (response.status === "success" && response.claimed && response.job) {
      await launch(response.job, ownerId)
      return schedule(100)
    }
    if (response.status !== "success") {
      log.warn("runner claim rejected", {
        projectId: selectedProjectId,
        error: response.error_message || response.error_code,
      })
    }
  } catch (error) {
    log.warn("runner poll failed", {
      projectId: selectedProjectId,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    polling = false
  }
  schedule()
}

export namespace WebDelegationRunner {
  function values(raw: string | undefined, fallback: string[] = []) {
    const result = (raw || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
    return result.length ? [...new Set(result)] : fallback
  }

  function truthy(raw: string | undefined) {
    const value = raw?.trim().toLowerCase()
    return value === "1" || value === "true" || value === "yes" || value === "on"
  }

  export function capabilities(env: Record<string, string | undefined> = process.env) {
    return {
      runtimes: ["legion-cli"],
      providers: values(env.LEGION_RUNNER_PROVIDERS),
      models: values(env.LEGION_RUNNER_MODELS),
      runnerPools: values(env.LEGION_RUNNER_POOLS, ["default"]),
      dataResidencies: values(env.LEGION_RUNNER_RESIDENCIES),
      local: truthy(env.LEGION_RUNNER_LOCAL),
      networkIsolated: truthy(env.LEGION_RUNNER_NETWORK_ISOLATED),
    }
  }

  export function isEnabled(env: Record<string, string | undefined> = process.env) {
    return truthy(env.LEGION_AGENT_WORKSPACE_ENABLED)
  }

  export function start(input: { companyId: string; projectId: string; targetPath?: string }) {
    if (!isEnabled() || process.env.LEGION_WEB_RUNNER_DISABLED === "1") return
    selectedCompanyId = input.companyId
    selectedProjectId = input.projectId
    fallbackTargetPath = input.targetPath
    stopped = false
    log.info("web delegation runner enabled", {
      companyId: selectedCompanyId,
      projectId: selectedProjectId,
      targetPath: projectPath(selectedProjectId),
    })
    schedule(0)
  }

  export function stop() {
    stopped = true
    selectedProjectId = undefined
    selectedCompanyId = undefined
    if (timer) clearTimeout(timer)
    timer = undefined
    log.info("web delegation runner stopped", { active: String(active.size) })
  }
}
