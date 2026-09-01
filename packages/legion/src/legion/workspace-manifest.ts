import { createHash } from "crypto"
import { createReadStream, lstatSync, readlinkSync } from "fs"
import path from "path"

export interface WorkspaceFileState {
  path: string
  status: string
  size: number
  sha256: string | null
}

export type WorkspaceSnapshot = Map<string, WorkspaceFileState>

function changedPaths(directory: string): Array<{ path: string; status: string }> {
  const result = Bun.spawnSync(
    ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"],
    { cwd: directory, stdout: "pipe", stderr: "pipe" },
  )
  if (result.exitCode !== 0) return []
  return result.stdout
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ status: entry.slice(0, 2), path: entry.slice(3) }))
    .filter((entry) => entry.path && !path.isAbsolute(entry.path) && !entry.path.split(path.sep).includes(".."))
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest("hex")
}

async function fileState(directory: string, item: { path: string; status: string }): Promise<WorkspaceFileState> {
  const absolute = path.join(directory, item.path)
  try {
    const stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(absolute)
      return {
        path: item.path,
        status: item.status,
        size: Buffer.byteLength(target),
        sha256: createHash("sha256").update(`symlink:${target}`).digest("hex"),
      }
    }
    if (!stat.isFile()) return { path: item.path, status: item.status, size: stat.size, sha256: null }
    return { path: item.path, status: item.status, size: stat.size, sha256: await sha256(absolute) }
  } catch {
    return { path: item.path, status: item.status, size: 0, sha256: null }
  }
}

export async function captureWorkspaceSnapshot(directory: string): Promise<WorkspaceSnapshot> {
  const entries = changedPaths(directory).slice(0, 2000)
  const states = await Promise.all(entries.map((entry) => fileState(directory, entry)))
  return new Map(states.map((state) => [state.path, state]))
}

export function workspaceChanges(before: WorkspaceSnapshot, after: WorkspaceSnapshot): WorkspaceFileState[] {
  return [...after.values()]
    .filter((current) => {
      const previous = before.get(current.path)
      return !previous
        || previous.status !== current.status
        || previous.size !== current.size
        || previous.sha256 !== current.sha256
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}
