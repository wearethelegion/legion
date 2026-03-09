import { Installation } from "@/installation"
import { Server } from "@/server/server"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import { InstanceBootstrap } from "@/project/bootstrap"
import { Rpc } from "@/util/rpc"
import { upgrade } from "@/cli/upgrade"
import { Config } from "@/config/config"
import { GlobalBus } from "@/bus/global"
import { createLegionClient, type Event } from "@wearethelegion/sdk/v2"
import type { BunWebSocketData } from "hono/bun"
import { Flag } from "@/flag/flag"
import { setLegionSession } from "@/legion/auth"

await Log.init({
  print: process.argv.includes("--print-logs"),
  dev: Installation.isLocal(),
  level: (() => {
    if (Installation.isLocal()) return "DEBUG"
    return "INFO"
  })(),
})

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: e instanceof Error ? e.message : e,
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: e instanceof Error ? e.message : e,
  })
})

// Subscribe to global events and forward them via RPC
GlobalBus.on("event", (event) => {
  Rpc.emit("global.event", event)
})

let server: Bun.Server<BunWebSocketData> | undefined

const eventStream = {
  abort: undefined as AbortController | undefined,
}

const startEventStream = (directory: string) => {
  if (eventStream.abort) eventStream.abort.abort()
  const abort = new AbortController()
  eventStream.abort = abort
  const signal = abort.signal

  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const auth = getAuthorizationHeader()
    if (auth) request.headers.set("Authorization", auth)
    return Server.App().fetch(request)
  }) as typeof globalThis.fetch

  const sdk = createLegionClient({
    baseUrl: "http://legion.internal",
    directory,
    fetch: fetchFn,
    signal,
  })

  ;(async () => {
    while (!signal.aborted) {
      const events = await Promise.resolve(
        sdk.event.subscribe(
          {},
          {
            signal,
          },
        ),
      ).catch(() => undefined)

      if (!events) {
        await Bun.sleep(250)
        continue
      }

      for await (const event of events.stream) {
        Rpc.emit("event", event as Event)
      }

      if (!signal.aborted) {
        await Bun.sleep(250)
      }
    }
  })().catch((error) => {
    Log.Default.error("event stream error", {
      error: error instanceof Error ? error.message : error,
    })
  })
}

startEventStream(process.cwd())

export const rpc = {
  async fetch(input: { url: string; method: string; headers: Record<string, string>; body?: string }) {
    const headers = { ...input.headers }
    const auth = getAuthorizationHeader()
    if (auth && !headers["authorization"] && !headers["Authorization"]) {
      headers["Authorization"] = auth
    }
    const request = new Request(input.url, {
      method: input.method,
      headers,
      body: input.body,
    })
    const response = await Server.App().fetch(request)
    const body = await response.text()
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    }
  },
  async server(input: { port: number; hostname: string; mdns?: boolean; cors?: string[] }) {
    if (server) await server.stop(true)
    server = Server.listen(input)
    return { url: server.url.toString() }
  },
  async checkUpgrade(input: { directory: string }) {
    await Instance.provide({
      directory: input.directory,
      init: InstanceBootstrap,
      fn: async () => {
        await upgrade().catch(() => {})
      },
    })
  },
  async reload() {
    Config.global.reset()
    await Instance.disposeAll()
  },
  async loginLegion(input: { email: string; password: string; serverUrl?: string }) {
    Log.Default.info("worker.loginLegion: starting", { email: input.email, serverUrl: input.serverUrl ?? "default" })
    try {
      const { authenticateLegion } = await import("@/legion/auth")
      Log.Default.info("worker.loginLegion: imported authenticateLegion, calling...")
      const client = await authenticateLegion(input)
      if (!client) {
        Log.Default.warn("worker.loginLegion: authenticateLegion returned null")
        return { success: false as const, error: "Authentication returned null" }
      }
      Log.Default.info("worker.loginLegion: success", {
        email: client.userEmail,
        projects: String(client.userProjects.length),
      })
      return {
        success: true as const,
        projects: client.userProjects,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Log.Default.error("worker.loginLegion: error", { error: msg })
      return { success: false as const, error: msg }
    }
  },
  async selectProject(input: { companyId: string; projectId: string }) {
    setLegionSession(input.companyId, input.projectId)
    process.env.LEGION_COMPANY_ID = input.companyId
    process.env.LEGION_PROJECT_ID = input.projectId

    // Bootstrap identity now that we have a valid project/company scope.
    // Wrapped in try/catch — env vars above are already set; identity
    // bootstrap is best-effort and must never roll them back.
    try {
      const { bootstrapLegion } = await import("@/legion/bootstrap")
      await bootstrapLegion({
        companyId: input.companyId,
        projectId: input.projectId,
      })
    } catch (err) {
      Log.Default.warn("bootstrapLegion failed after project select — proceeding with env vars only", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },
  async shutdown() {
    Log.Default.info("worker shutting down")
    if (eventStream.abort) eventStream.abort.abort()
    await Promise.race([
      Instance.disposeAll(),
      new Promise((resolve) => {
        setTimeout(resolve, 5000)
      }),
    ])
    if (server) server.stop(true)
  },
}

Rpc.listen(rpc)

function getAuthorizationHeader(): string | undefined {
  const password = Flag.LEGION_SERVER_PASSWORD
  if (!password) return undefined
  const username = Flag.LEGION_SERVER_USERNAME ?? "legion"
  return `Basic ${btoa(`${username}:${password}`)}`
}
