import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { HeadlessMode } from "../../legion/headless"

export const DelegateCommand = cmd({
  command: "delegate",
  describe: "run a headless LEGION delegation",
  builder: (yargs: Argv) =>
    yargs
      .option("agent_id", { type: "string", demandOption: true, describe: "LEGION agent UUID" })
      .option("task", { type: "string", demandOption: true, describe: "task description" })
      .option("delegation_id", { type: "string", demandOption: true, describe: "delegation UUID" })
      .option("engagement_id", { type: "string", demandOption: true, describe: "engagement UUID" })
      .option("project_id", { type: "string", demandOption: true, describe: "project UUID" })
      .option("target_path", { type: "string", demandOption: true, describe: "working directory" })
      .option("company_id", { type: "string", demandOption: true, describe: "LEGION company UUID" })
      .option("run_id", { type: "string", describe: "Agent Workspace run UUID" })
      .option("task_id", { type: "string", describe: "LEGION task UUID" })
      .option("ipc_sock", { type: "string", demandOption: true, describe: "Unix socket for IPC" })
      .option("model", { type: "string", describe: "model override (provider/model)" })
      .option("context", { type: "string", describe: "additional context" })
      .option("owner_id", { type: "string", describe: "pre-claimed runner owner ID" })
      .option("max_turns", { type: "number", describe: "maximum autonomous turns" })
      .option("timeout_seconds", { type: "number", describe: "execution timeout in seconds" })
      .option("cost_budget_usd", { type: "number", describe: "maximum execution cost in USD" })
      .option("tool_policy", { type: "string", describe: "snapshotted execution-policy JSON" }),
      // .option("mcp_config", { type: "string", describe: "JSON-serialised parent MCP config for inheritance" }),
  handler: async (args) => {
    await HeadlessMode.run({
      agentId: args.agent_id as string,
      task: args.task as string,
      delegationId: args.delegation_id as string,
      engagementId: args.engagement_id as string,
      projectId: args.project_id as string,
      targetPath: args.target_path as string,
      companyId: args.company_id as string,
      runId: args.run_id as string | undefined,
      taskId: args.task_id as string | undefined,
      ipcSock: args.ipc_sock as string,
      model: args.model as string | undefined,
      context: args.context as string | undefined,
      ownerId: args.owner_id as string | undefined,
      maxTurns: args.max_turns as number | undefined,
      timeoutSeconds: args.timeout_seconds as number | undefined,
      costBudgetUsd: args.cost_budget_usd as number | undefined,
      toolPolicy: args.tool_policy
        ? (JSON.parse(args.tool_policy as string) as unknown)
        : undefined,
    })
  }
})
