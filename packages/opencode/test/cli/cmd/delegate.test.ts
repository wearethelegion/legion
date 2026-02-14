import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"

/**
 * DelegateCommand — Structural verification of the CLI command definition.
 * Verifies exports, required/optional options, and handler wiring.
 */
describe("DelegateCommand", () => {
  const delegatePath = path.resolve(__dirname, "../../../src/cli/cmd/delegate.ts")

  test("exports DelegateCommand", async () => {
    const mod = await import("../../../src/cli/cmd/delegate")
    expect(mod.DelegateCommand).toBeDefined()
    expect(mod.DelegateCommand.command).toBe("delegate")
  })

  test("has a describe field", async () => {
    const mod = await import("../../../src/cli/cmd/delegate")
    expect(mod.DelegateCommand.describe).toBeTruthy()
    expect(typeof mod.DelegateCommand.describe).toBe("string")
  })

  test("has a handler function", async () => {
    const mod = await import("../../../src/cli/cmd/delegate")
    expect(typeof mod.DelegateCommand.handler).toBe("function")
  })

  test("defines required options: agent-id, task, delegation-id, engagement-id, project-id, target-path, company-id, ipc-sock", async () => {
    const content = await fs.readFile(delegatePath, "utf-8")

    const requiredOptions = [
      "agent-id",
      "task",
      "delegation-id",
      "engagement-id",
      "project-id",
      "target-path",
      "company-id",
      "ipc-sock",
    ]

    for (const opt of requiredOptions) {
      expect(content).toContain(`"${opt}"`)
      // Each required option uses demandOption: true
    }

    // Verify demandOption: true appears for required options
    // Count occurrences of demandOption: true
    const demandMatches = content.match(/demandOption:\s*true/g)
    expect(demandMatches).not.toBeNull()
    expect(demandMatches!.length).toBe(requiredOptions.length)
  })

  test("defines optional options: model, context", async () => {
    const content = await fs.readFile(delegatePath, "utf-8")

    const optionalOptions = ["model", "context"]

    for (const opt of optionalOptions) {
      expect(content).toContain(`"${opt}"`)
    }

    // Optional options should NOT have demandOption: true
    // Verify each optional option line doesn't include demandOption
    for (const opt of optionalOptions) {
      // Find the option block — it starts with .option("name" and ends before next .option
      const pattern = new RegExp(`\\.option\\("${opt}"[^)]+\\)`)
      const match = content.match(pattern)
      expect(match).not.toBeNull()
      expect(match![0]).not.toContain("demandOption")
    }
  })

  test("handler maps CLI args to HeadlessMode.run() params", async () => {
    const content = await fs.readFile(delegatePath, "utf-8")

    // Verify the handler correctly maps kebab-case CLI args to camelCase params
    expect(content).toContain('args["agent-id"]')
    expect(content).toContain("args.task")
    expect(content).toContain('args["delegation-id"]')
    expect(content).toContain('args["engagement-id"]')
    expect(content).toContain('args["project-id"]')
    expect(content).toContain('args["target-path"]')
    expect(content).toContain('args["ipc-sock"]')
    expect(content).toContain("args.model")
    expect(content).toContain("args.context")
  })

  test("handler calls HeadlessMode.run()", async () => {
    const content = await fs.readFile(delegatePath, "utf-8")
    expect(content).toContain("HeadlessMode.run(")
  })
})
