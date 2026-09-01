import { $, file } from "bun"
import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import {
  commitApplicationWorkspace,
  createApplicationWorkspace,
  removeApplicationWorkspace,
} from "../../src/legion/application-workspace"

describe("application workspace", () => {
  test("delivers on an isolated persistent branch without editing the mapped checkout", async () => {
    await using source = await tmpdir({ git: true })
    await Bun.write(path.join(source.path, "README.md"), "base\n")
    await $`git add README.md`.cwd(source.path).quiet()
    await $`git commit -m baseline`.cwd(source.path).quiet()

    const workspace = createApplicationWorkspace(source.path, "run-123")
    try {
      await Bun.write(path.join(workspace.targetPath, "app.ts"), "export const ready = true\n")
      const delivery = commitApplicationWorkspace(workspace.targetPath, workspace.branch)

      expect(delivery.branch).toBe("legion/application-run-123")
      expect(delivery.commit).toMatch(/^[a-f0-9]{40}$/)
      expect(await file(path.join(source.path, "app.ts")).exists()).toBe(false)
      expect(
        (await $`git show ${delivery.branch}:app.ts`.cwd(source.path).quiet().text()).trim(),
      ).toBe("export const ready = true")
    } finally {
      removeApplicationWorkspace(workspace)
      await $`git branch -D ${workspace.branch}`.cwd(source.path).quiet().nothrow()
    }
  })
})
