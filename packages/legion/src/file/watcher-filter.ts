import path from "path"
import { FileIgnore } from "./ignore"

export function relativeWatcherPath(directory: string, file: string) {
  const relative = path.relative(directory, file).replaceAll("\\", "/")
  if (path.isAbsolute(relative)) return
  if (relative === ".." || relative.startsWith("../")) return
  return relative
}

function matchesConfiguredIgnore(file: string, pattern: string) {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "")
  if (!normalized) return false
  if (file === normalized || file.startsWith(`${normalized}/`)) return true

  try {
    return new Bun.Glob(normalized).match(file)
  } catch {
    return false
  }
}

export function shouldPublishWatcherPath(input: {
  directory: string
  file: string
  git: boolean
  configuredIgnores?: string[]
}) {
  const file = relativeWatcherPath(input.directory, input.file)
  if (file === undefined) return false
  if (input.git) return file === "HEAD"
  if (FileIgnore.match(file)) return false
  if (input.configuredIgnores?.some((pattern) => matchesConfiguredIgnore(file, pattern))) return false
  return true
}
