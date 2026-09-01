import { lstatSync } from "fs"
import path from "path"
import { resolveContainedPath } from "./execution-guardrails"

export interface ApplicationHandover {
  schema_version: 1
  name: string
  version: string
  source_root: string
  build_command: string
  test_command: string
  run_command: string
  documentation_path: string
  deployment_target: "local"
  ownership: "company"
}

function requiredString(value: unknown, field: string, maxLength = 1000): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Application handover field ${field} is required`)
  }
  const result = value.trim()
  if (result.length > maxLength || result.includes("\0")) {
    throw new Error(`Application handover field ${field} is invalid`)
  }
  return result
}

export async function loadApplicationHandover(workspace: string): Promise<ApplicationHandover> {
  const manifestPath = path.join(workspace, "legion.application.json")
  let stat
  try {
    stat = lstatSync(manifestPath)
  } catch {
    throw new Error("Application delivery is missing legion.application.json")
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) {
    throw new Error("Application handover manifest must be a regular JSON file under 64 KB")
  }
  let raw: Record<string, unknown>
  try {
    raw = await Bun.file(manifestPath).json()
  } catch {
    throw new Error("Application handover manifest is not valid JSON")
  }
  if (raw.schema_version !== 1) throw new Error("Application handover schema_version must be 1")
  if (raw.deployment_target !== "local") {
    throw new Error("Application handover deployment_target must be local")
  }
  if (raw.ownership !== "company") throw new Error("Application handover ownership must be company")

  const sourceRoot = requiredString(raw.source_root, "source_root")
  const documentationPath = requiredString(raw.documentation_path, "documentation_path")
  resolveContainedPath(workspace, path.resolve(workspace, sourceRoot))
  resolveContainedPath(workspace, path.resolve(workspace, documentationPath))

  return {
    schema_version: 1,
    name: requiredString(raw.name, "name", 120),
    version: requiredString(raw.version, "version", 80),
    source_root: sourceRoot,
    build_command: requiredString(raw.build_command, "build_command"),
    test_command: requiredString(raw.test_command, "test_command"),
    run_command: requiredString(raw.run_command, "run_command"),
    documentation_path: documentationPath,
    deployment_target: "local",
    ownership: "company",
  }
}
