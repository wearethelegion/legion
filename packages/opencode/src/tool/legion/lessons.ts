import z from "zod"
import { Tool } from "../tool"
import { client, output, projectId } from "./index"

const RecordLessonTool = Tool.define("recordLesson", {
  description: "Record a resolved issue as a lesson learned. Document symptom, root cause, solution, prevention.",
  parameters: z.object({
    category: z.string().describe("Category path (e.g. Infrastructure/Docker)"),
    title: z.string().describe("Short descriptive title"),
    symptom: z.string().describe("What error/behavior was observed"),
    root_cause: z.string().describe("Why it happened"),
    solution: z.string().describe("Step-by-step fix"),
    prevention: z.string().describe("How to avoid in future"),
    severity: z.string().optional().default("medium"),
    tags: z.array(z.string()).optional(),
    files_changed: z.array(z.string()).optional(),
    engagement_id: z.string().optional().describe("LEGION engagement UUID for traceability"),
  }),
  async execute(params) {
    const result = await client().recordLesson({
      projectId: projectId(),
      category: params.category,
      title: params.title,
      symptom: params.symptom,
      rootCause: params.root_cause,
      solution: params.solution,
      prevention: params.prevention,
      severity: params.severity,
      tags: params.tags,
      filesChanged: params.files_changed,
    })
    return output(result)
  },
})

const QueryLessonsTool = Tool.define("queryLessons", {
  description: "Search past resolved issues to find solutions for current problems.",
  parameters: z.object({
    query: z.string().describe("Describe the problem"),
    category_filter: z.string().optional().default(""),
    limit: z.number().optional().default(10),
  }),
  async execute(params) {
    const result = await client().queryLessons(params.query, projectId(), {
      categoryFilter: params.category_filter,
      limit: params.limit,
    })
    return output(result)
  },
})

export const LessonTools = [RecordLessonTool, QueryLessonsTool]
