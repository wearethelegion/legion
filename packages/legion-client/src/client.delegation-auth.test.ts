import { describe, expect, test } from "bun:test"
import fs from "fs/promises"

describe("delegation worker authentication", () => {
  test("all worker lifecycle RPCs use authenticated retrying calls", async () => {
    const source = await fs.readFile(new URL("./client.ts", import.meta.url), "utf-8")
    for (const method of [
      "UpdateDelegationProgress",
      "UpdateDelegationStatus",
      "MarkInterrupted",
      "ClaimDelegation",
      "UpdateHeartbeat",
      "ClaimPendingDelegation",
      "RecordDelegationModel",
      "AppendDelegationEvent",
      "ListDelegationEvents",
    ]) {
      expect(source).toContain(`this.callWithAuth(this.delegationClient, "${method}"`)
    }
  })
})
