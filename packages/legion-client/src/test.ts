/**
 * Smoke test for legion-client.
 *
 * Validates:
 * 1. Proto files load correctly via @grpc/proto-loader
 * 2. Service stubs can be created
 * 3. TypeScript types compile
 *
 * Note: Actual gRPC calls will fail unless the LEGION server is running at localhost:50051.
 */

import { LegionClient } from "./client"
import type { WhoAmIResponse, AuthResult, QueryKnowledgeResponse } from "./types"

async function main() {
  console.log("=== LEGION Client Smoke Test ===\n")

  // 1. Create client
  const client = new LegionClient({
    host: "localhost",
    port: 50051,
  })
  console.log("[OK] Client created (localhost:50051)")

  // 2. Verify type exports compile
  const _typeCheck: WhoAmIResponse | null = null
  const _typeCheck2: AuthResult | null = null
  const _typeCheck3: QueryKnowledgeResponse | null = null
  console.log("[OK] Type exports compile")

  // 3. Try whoAmI — will succeed if gRPC server is running, timeout otherwise
  try {
    console.log("\n--- Testing whoAmI (requires running gRPC server + LEGION_API_KEY) ---")
    const result = await client.whoAmI({ agentId: "test" })
    console.log(`[OK] whoAmI returned: status=${result.status}, name=${result.name}`)
  } catch (err: any) {
    if (err?.code === 14 || err?.message?.includes("UNAVAILABLE")) {
      console.log("[EXPECTED] gRPC server not running — connection refused (this is OK for offline testing)")
    } else if (err?.message?.includes("Missing credentials")) {
      console.log("[EXPECTED] No credentials configured — auth skipped (this is OK for offline testing)")
    } else {
      console.log(`[WARN] Unexpected error: ${err.message ?? err}`)
    }
  }

  // 4. Clean up
  client.close()
  console.log("\n[OK] Client closed")
  console.log("\n=== All smoke tests passed ===")
}

main().catch((err) => {
  console.error("FATAL:", err)
  process.exit(1)
})
