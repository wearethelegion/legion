import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { HeadlessMode } from "../../legion/headless"

export const DelegateCommand = cmd({
  command: "delegate",
  describe: "run a headless LEGION delegation",
  builder: (yargs: Argv) =>
    yargs
      .option("agent-id", { type: "string", demandOption: true, describe: "LEGION agent UUID" })
      .option("task", { type: "string", demandOption: true, describe: "task description" })
      .option("delegation-id", { type: "string", demandOption: true, describe: "delegation UUID" })
      .option("engagement-id", { type: "string", demandOption: true, describe: "engagement UUID" })
      .option("project-id", { type: "string", demandOption: true, describe: "project UUID" })
      .option("target-path", { type: "string", demandOption: true, describe: "working directory" })
      .option("company-id", { type: "string", demandOption: true, describe: "LEGION company UUID" })
      .option("task-id", { type: "string", describe: "LEGION task UUID" })
      .option("ipc-sock", { type: "string", demandOption: true, describe: "Unix socket for IPC" })
      .option("model", { type: "string", describe: "model override (provider/model)" })
      .option("context", { type: "string", describe: "additional context" }),
  handler: async (args) => {
    await HeadlessMode.run({
      agentId: args["agent-id"] as string,
      task: args.task as string,
      delegationId: args["delegation-id"] as string,
      engagementId: args["engagement-id"] as string,
      projectId: args["project-id"] as string,
      targetPath: args["target-path"] as string,
      companyId: args["company-id"] as string,
      taskId: args["task-id"] as string | undefined,
      ipcSock: args["ipc-sock"] as string,
      model: args.model as string | undefined,
      context: args.context as string | undefined,
    })
  },
})
