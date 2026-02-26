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
      .option("task_id", { type: "string", describe: "LEGION task UUID" })
      .option("ipc_sock", { type: "string", demandOption: true, describe: "Unix socket for IPC" })
      .option("model", { type: "string", describe: "model override (provider/model)" })
      .option("context", { type: "string", describe: "additional context" }),
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
      taskId: args.task_id as string | undefined,
      ipcSock: args.ipc_sock as string,
      model: args.model as string | undefined,
      context: args.context as string | undefined,
    })
  }
})
