export * from "./client.js"
export * from "./server.js"

import { createLegionClient } from "./client.js"
import { createLegionServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export async function createLegion(options?: ServerOptions) {
  const server = await createLegionServer({
    ...options,
  })

  const client = createLegionClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
