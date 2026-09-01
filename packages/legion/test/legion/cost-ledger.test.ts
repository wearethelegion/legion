import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { RunCostLedger } from "../../src/legion/cost-ledger"

describe("run cost ledger", () => {
  test("enforces one aggregate budget across independent delegation processes", async () => {
    await using temporary = await tmpdir()
    const databasePath = path.join(temporary.path, "cost.sqlite")
    const parent = new RunCostLedger("run-1", 1, databasePath)
    const child = new RunCostLedger("run-1", 1, databasePath)

    expect(parent.consume(0.4)).toMatchObject({ spentUsd: 0.4, exceeded: false })
    expect(child.consume(0.5)).toMatchObject({ spentUsd: 0.9, exceeded: false })
    const exceeded = parent.consume(0.2)
    expect(exceeded.spentUsd).toBeCloseTo(1.1)
    expect(exceeded.exceeded).toBe(true)

    parent.close()
    child.close()
  })

  test("does not let a child replace the root run's immutable budget", async () => {
    await using temporary = await tmpdir()
    const databasePath = path.join(temporary.path, "cost.sqlite")
    const root = new RunCostLedger("run-1", 2, databasePath)
    expect(() => new RunCostLedger("run-1", 3, databasePath)).toThrow("immutable ledger")
    root.close()
  })
})
