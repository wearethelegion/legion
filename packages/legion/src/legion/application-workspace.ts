import { mkdirSync, realpathSync } from "fs"
import os from "os"
import path from "path"

export interface ApplicationWorkspace {
  sourceRepository: string
  sourceTarget: string
  workspaceRoot: string
  targetPath: string
  branch: string
}

function git(args: string[], cwd: string, allowedExitCodes = [0]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: process.platform === "win32",
  })
  if (!allowedExitCodes.includes(result.exitCode)) {
    const detail = result.stderr.toString().trim() || result.stdout.toString().trim()
    throw new Error(detail || `git ${args[0]} failed with exit code ${result.exitCode}`)
  }
  return result.stdout.toString().trim()
}

function safeRunId(runId: string): string {
  const value = runId.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 64)
  if (!value) throw new Error("Application run ID cannot produce a safe workspace name")
  return value
}

export function createApplicationWorkspace(sourceTarget: string, runId: string): ApplicationWorkspace {
  const resolvedTarget = realpathSync(sourceTarget)
  const sourceRepository = realpathSync(git(["rev-parse", "--show-toplevel"], resolvedTarget))
  const relativeTarget = path.relative(sourceRepository, resolvedTarget)
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    throw new Error("Application target must be contained in its Git repository")
  }

  const safeId = safeRunId(runId)
  const branch = `legion/application-${safeId}`
  const workspaceBase = path.join(os.tmpdir(), "legion-application-workspaces")
  const workspaceRoot = path.join(workspaceBase, safeId)
  mkdirSync(workspaceBase, { recursive: true })

  const branchExists = Bun.spawnSync(
    ["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    { cwd: sourceRepository, windowsHide: process.platform === "win32" },
  ).exitCode === 0
  if (branchExists) throw new Error(`Application delivery branch already exists: ${branch}`)

  git(["worktree", "add", "-b", branch, workspaceRoot, "HEAD"], sourceRepository)
  const targetPath = relativeTarget ? path.join(workspaceRoot, relativeTarget) : workspaceRoot
  return {
    sourceRepository,
    sourceTarget: resolvedTarget,
    workspaceRoot,
    targetPath,
    branch,
  }
}

export function commitApplicationWorkspace(
  targetPath: string,
  expectedBranch?: string,
): { branch: string; commit: string } {
  const repository = realpathSync(git(["rev-parse", "--show-toplevel"], targetPath))
  const branch = git(["branch", "--show-current"], repository)
  if (!branch || (expectedBranch && branch !== expectedBranch)) {
    throw new Error("Application workspace is not on the expected delivery branch")
  }
  git(["add", "-A"], repository)
  const staged = Bun.spawnSync(["git", "diff", "--cached", "--quiet"], {
    cwd: repository,
    windowsHide: process.platform === "win32",
  })
  if (staged.exitCode === 0) throw new Error("Application delivery produced no commit-ready changes")
  if (staged.exitCode !== 1) throw new Error("Application delivery staged-change verification failed")
  git(
    [
      "-c",
      "user.name=Legion",
      "-c",
      "user.email=legion@localhost",
      "commit",
      "-m",
      "feat: deliver Legion application",
    ],
    repository,
  )
  return { branch, commit: git(["rev-parse", "HEAD"], repository) }
}

export function removeApplicationWorkspace(workspace: ApplicationWorkspace, deleteBranch = false): void {
  git(["worktree", "remove", "--force", workspace.workspaceRoot], workspace.sourceRepository)
  if (deleteBranch) git(["branch", "-D", workspace.branch], workspace.sourceRepository)
}
