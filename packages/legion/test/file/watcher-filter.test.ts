import { describe, expect, test } from "bun:test"
import { relativeWatcherPath, shouldPublishWatcherPath } from "../../src/file/watcher-filter"

describe("watcher event filtering", () => {
  test("normalizes paths inside the watched directory", () => {
    expect(relativeWatcherPath("/repo", "/repo/src/index.ts")).toBe("src/index.ts")
    expect(relativeWatcherPath("/repo", "/other/index.ts")).toBeUndefined()
  })

  test("filters noisy build and configured paths after native watcher delivery", () => {
    expect(shouldPublishWatcherPath({ directory: "/repo", file: "/repo/out/renderer.js", git: false })).toBe(false)
    expect(
      shouldPublishWatcherPath({
        directory: "/repo",
        file: "/repo/generated/client.ts",
        git: false,
        configuredIgnores: ["generated"],
      }),
    ).toBe(false)
    expect(shouldPublishWatcherPath({ directory: "/repo", file: "/repo/src/index.ts", git: false })).toBe(true)
  })

  test("only publishes HEAD updates from git metadata", () => {
    expect(shouldPublishWatcherPath({ directory: "/repo/.git", file: "/repo/.git/HEAD", git: true })).toBe(true)
    expect(shouldPublishWatcherPath({ directory: "/repo/.git", file: "/repo/.git/index", git: true })).toBe(false)
    expect(
      shouldPublishWatcherPath({
        directory: "/repo/.git/worktrees/feature",
        file: "/repo/.git/worktrees/feature/HEAD",
        git: true,
      }),
    ).toBe(true)
  })
})
