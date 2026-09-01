import { describe, expect, test } from "bun:test"
import path from "path"
import { Discovery } from "../../src/skill/discovery"
import { Global } from "../../src/global"
import { tmpdir } from "../fixture/fixture"

interface SkillServer {
  url: string
  requests: Map<string, number>
}

async function withSkillServer(fn: (server: SkillServer) => Promise<void>, options: { invalidIndex?: boolean } = {}) {
  await using cache = await tmpdir()
  const originalCache = Global.Path.cache
  ;(Global.Path as { cache: string }).cache = cache.path
  const requests = new Map<string, number>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname
      requests.set(pathname, (requests.get(pathname) ?? 0) + 1)
      if (pathname === "/skills/index.json") {
        if (options.invalidIndex) return new Response("not-json")
        return Response.json({
          skills: [
            {
              name: "agents-sdk",
              description: "Test skill",
              files: ["SKILL.md", "references/api.md"],
            },
          ],
        })
      }
      if (pathname === "/skills/agents-sdk/SKILL.md") {
        return new Response("---\nname: agents-sdk\ndescription: Test skill\n---\n# Agents SDK\n")
      }
      if (pathname === "/skills/agents-sdk/references/api.md") {
        return new Response("# API reference\n")
      }
      return new Response("not found", { status: 404 })
    },
  })

  try {
    await fn({ url: `${server.url}skills/`, requests })
  } finally {
    server.stop(true)
    ;(Global.Path as { cache: string }).cache = originalCache
  }
}

describe("Discovery.pull", () => {
  test("downloads skills from a standards-compatible index", async () => {
    await withSkillServer(async ({ url }) => {
      const dirs = await Discovery.pull(url)
      expect(dirs).toHaveLength(1)
      expect(dirs[0]).toStartWith(Discovery.dir())
      expect(await Bun.file(path.join(dirs[0], "SKILL.md")).exists()).toBe(true)
    })
  })

  test("accepts an index URL without a trailing slash", async () => {
    await withSkillServer(async ({ url }) => {
      const dirs = await Discovery.pull(url.replace(/\/$/, ""))
      expect(dirs).toHaveLength(1)
      expect(await Bun.file(path.join(dirs[0], "SKILL.md")).exists()).toBe(true)
    })
  })

  test("returns an empty array when the index is unreachable", async () => {
    expect(await Discovery.pull("http://127.0.0.1:1/skills/")).toEqual([])
  })

  test("returns an empty array for a non-JSON index", async () => {
    await withSkillServer(
      async ({ url }) => {
        expect(await Discovery.pull(url)).toEqual([])
      },
      { invalidIndex: true },
    )
  })

  test("downloads reference files alongside SKILL.md", async () => {
    await withSkillServer(async ({ url }) => {
      const dirs = await Discovery.pull(url)
      expect(await Bun.file(path.join(dirs[0], "references", "api.md")).exists()).toBe(true)
    })
  })

  test("reuses cached files on a second pull", async () => {
    await withSkillServer(async ({ url, requests }) => {
      const first = await Discovery.pull(url)
      const skillRequests = requests.get("/skills/agents-sdk/SKILL.md")
      const second = await Discovery.pull(url)

      expect(second).toEqual(first)
      expect(requests.get("/skills/agents-sdk/SKILL.md")).toBe(skillRequests)
      expect(requests.get("/skills/index.json")).toBe(2)
    })
  })
})
