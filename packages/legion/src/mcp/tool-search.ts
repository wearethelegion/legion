// import z from "zod"
// import { Tool } from "../tool/tool"
// import { Log } from "../util/log"
// import { MCP } from "./index"

// const log = Log.create({ service: "mcp.tool-search" })

// export const McpToolSearchTool = Tool.define("mcp_tool_search", async () => {
//   return {
//     description:
//       "Search for available MCP tools by keyword. Returns matching tools with their descriptions and input schemas.",
//     parameters: z.object({
//       query: z.string().describe("Search query to find relevant MCP tools"),
//     }),
//     async execute(args, _ctx) {
//       log.info("searching MCP tools", { query: args.query })
//       const matches = await MCP.searchTools(args.query)
//       return {
//         title: `MCP tool search: "${args.query}"`,
//         output: JSON.stringify(matches, null, 2),
//         metadata: { count: matches.length },
//       }
//     },
//   }
// })

// export const McpCallTool = Tool.define("mcp_call_tool", async () => {
//   return {
//     description: "Call an MCP tool on a specific server. Use mcp_tool_search first to discover available tools.",
//     parameters: z.object({
//       server: z.string().describe("MCP server name"),
//       tool: z.string().describe("Tool name"),
//       args: z.record(z.string(), z.unknown()).optional().describe("Tool arguments"),
//     }),
//     async execute(params, _ctx) {
//       log.info("calling MCP tool", { server: params.server, tool: params.tool })
//       const result = await MCP.callToolByName(params.server, params.tool, params.args ?? {})
//       return {
//         title: `MCP call: ${params.server}/${params.tool}`,
//         output: JSON.stringify(result, null, 2),
//         metadata: {},
//       }
//     },
//   }
// })
