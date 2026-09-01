import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import {
  loadApplicationHandover,
  verifyApplicationCommands,
} from "../../src/legion/application-handover"

describe("application handover", () => {
  test("accepts a complete company-owned local deployment contract", async () => {
    await using workspace = await tmpdir({
      init: async (directory) => {
        await Bun.write(path.join(directory, "README.md"), "# Run guide\n")
        await Bun.write(path.join(directory, "app.ts"), "export {}\n")
      },
    })
    await Bun.write(path.join(workspace.path, "legion.application.json"), JSON.stringify({
      schema_version: 1,
      name: "Maintenance Planner",
      version: "1.0.0",
      source_root: ".",
      build_command: "npm run build",
      test_command: "npm test",
      run_command: "npm start",
      documentation_path: "README.md",
      deployment_target: "local",
      ownership: "company",
    }))

    expect(await loadApplicationHandover(workspace.path)).toMatchObject({
      name: "Maintenance Planner",
      deployment_target: "local",
      ownership: "company",
    })
  })

  test("rejects missing, invalid, or escaping handover paths", async () => {
    await using workspace = await tmpdir()
    await using outside = await tmpdir({
      init: async (directory) => Bun.write(path.join(directory, "README.md"), "outside"),
    })
    await Bun.write(path.join(workspace.path, "legion.application.json"), JSON.stringify({
      schema_version: 1,
      name: "Unsafe app",
      version: "1",
      source_root: ".",
      build_command: "npm run build",
      test_command: "npm test",
      run_command: "npm start",
      documentation_path: path.join(outside.path, "README.md"),
      deployment_target: "local",
      ownership: "company",
    }))

    await expect(loadApplicationHandover(workspace.path)).rejects.toThrow("escapes")
  })

  test("requires the declared build and test commands to have succeeded exactly", async () => {
    const handover = {
      schema_version: 1 as const,
      name: "Planner",
      version: "1.0.0",
      source_root: ".",
      build_command: "npm run build",
      test_command: "npm test",
      run_command: "npm start",
      documentation_path: "README.md",
      deployment_target: "local" as const,
      ownership: "company" as const,
    }

    expect(
      verifyApplicationCommands(handover, [
        { command: "npm run build", exitCode: 0 },
        { command: "npm test", exitCode: 0 },
      ]),
    ).toEqual({ build_command: "npm run build", test_command: "npm test" })
    expect(() =>
      verifyApplicationCommands(handover, [
        { command: "npm run build -- --watch", exitCode: 0 },
        { command: "npm test", exitCode: 0 },
      ]),
    ).toThrow("build command was not observed")
    expect(() =>
      verifyApplicationCommands(handover, [
        { command: "npm run build", exitCode: 0 },
        { command: "npm test", exitCode: 1 },
      ]),
    ).toThrow("test command was not observed")
  })
})
