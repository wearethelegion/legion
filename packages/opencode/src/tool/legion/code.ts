import z from "zod"
import { Tool } from "../tool"
import { client, output, stringRecord, projectId } from "./index"

const FindSimilarCodeTool = Tool.define("findSimilarCode", {
  description: "Search indexed code by natural language or code snippet.",
  parameters: z.object({
    query: z.string().describe("Natural language or code snippet"),
    language: z.string().optional().describe("Filter by language"),
    limit: z.number().optional().default(10),
  }),
  async execute(params) {
    const result = await client().findSimilarCode(params.query, {
      language: params.language,
      projectId: projectId(),
      limit: params.limit,
    })
    return output(result)
  },
})

const AnalyzeImpactTool = Tool.define("analyzeImpact", {
  description: "Analyze blast radius of changing a function/class. Shows upstream callers and downstream callees.",
  parameters: z.object({
    entity_name: z.string().describe("Function/class name"),
    entity_type: z.string().describe("function, class, or method"),
    max_depth: z.number().optional().default(3),
  }),
  async execute(params) {
    const result = await client().analyzeImpact(params.entity_name, params.entity_type, projectId(), params.max_depth)
    return output(result)
  },
})

const TraceExecutionFlowTool = Tool.define("traceExecutionFlow", {
  description: "Trace what functions get called starting from an entry point (DFS traversal).",
  parameters: z.object({
    entry_point: z.string().describe("Starting function name"),
    max_depth: z.number().optional().default(5),
  }),
  async execute(params) {
    const result = await client().traceExecutionFlow(params.entry_point, projectId(), params.max_depth)
    return output(result)
  },
})

export const CodeTools = [FindSimilarCodeTool, AnalyzeImpactTool, TraceExecutionFlowTool]
