import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { captureWorkspaceSnapshot, workspaceChanges } from "../../src/legion/workspace-manifest"

describe("application workspace manifest", () => {
  test("records only files created or changed during the governed run", async () => {
    await using workspace = await tmpdir({ git: true })
    const before = await captureWorkspaceSnapshot(workspace.path)
    await Bun.write(path.join(workspace.path, "app.ts"), "export const app = 'owned'\n")
    const afterCreate = await captureWorkspaceSnapshot(workspace.path)
    const created = workspaceChanges(before, afterCreate)

    expect(created).toHaveLength(1)
    expect(created[0].path).toBe("app.ts")
    expect(created[0].status).toBe("??")
    expect(created[0].size).toBeGreaterThan(0)
    expect(created[0].sha256).toMatch(/^[a-f0-9]{64}$/)

    await Bun.write(path.join(workspace.path, "app.ts"), "export const app = 'verified'\n")
    const afterUpdate = await captureWorkspaceSnapshot(workspace.path)
    const updated = workspaceChanges(afterCreate, afterUpdate)
    expect(updated).toHaveLength(1)
    expect(updated[0].sha256).not.toBe(created[0].sha256)
  })
})
