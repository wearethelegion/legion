/**
 * TurnExtraction Zod Schema
 *
 * Central data contract for what gets extracted from each conversation turn.
 * Designed for Anthropic Haiku structured outputs via zodOutputFormat().
 *
 * Constraints respected (Anthropic structured outputs):
 * - No recursive schemas
 * - No numerical constraints (minimum, maximum)
 * - No string length constraints (minLength, maxLength)
 * - additionalProperties not used except as false
 * - Array minItems only supports 0 and 1
 * - Supported: objects, arrays, strings, enums, const, anyOf, allOf, optional
 */

import z from "zod"

export const ExtractedConcept = z.object({
  entity: z.string().describe("The concept name, e.g. 'Neo4j', 'event sourcing'"),
  type: z.enum(["technology", "pattern", "requirement", "constraint", "domain_concept"]),
  context: z.string().describe("Brief context of how it was mentioned"),
})
export type ExtractedConcept = z.infer<typeof ExtractedConcept>

export const ExtractedDecision = z.object({
  choice: z.string().describe("What was decided"),
  chosen: z.string().describe("The option that was selected"),
  rejected: z.string().optional().describe("Alternative that was rejected, if any"),
  reasoning: z.string().describe("Why this choice was made"),
})
export type ExtractedDecision = z.infer<typeof ExtractedDecision>

export const ExtractedPreference = z.object({
  category: z.string().describe("Category like 'code_style', 'communication', 'tooling'"),
  key: z.string().describe("Specific preference key"),
  value: z.string().describe("The preference value"),
  source: z.enum(["explicit", "inferred"]),
})
export type ExtractedPreference = z.infer<typeof ExtractedPreference>

export const ExtractedTopic = z.object({
  name: z.string().describe("Topic being discussed"),
  status: z.enum(["exploring", "active", "decided", "abandoned"]),
})
export type ExtractedTopic = z.infer<typeof ExtractedTopic>

export const ExtractedCodeRef = z.object({
  path: z.string().describe("File path, e.g. 'src/auth/handler.ts'"),
  name: z
    .string()
    .describe(
      "Name of the entity: filename for files, function/class/module name otherwise (e.g. 'validateToken', 'AuthService')",
    ),
  type: z.enum(["file", "function", "class", "module"]),
  action: z.enum(["discussed", "planned", "modified", "created"]),
})
export type ExtractedCodeRef = z.infer<typeof ExtractedCodeRef>

export const LegionContext = z.object({
  engagement_id: z
    .string()
    .optional()
    .describe("UUID of the LEGION engagement actively discussed in this turn, if any"),
  task_id: z
    .string()
    .optional()
    .describe("UUID of the LEGION task actively discussed in this turn, if any"),
  delegation_id: z
    .string()
    .optional()
    .describe("UUID of the LEGION delegation actively discussed in this turn, if any"),
})
export type LegionContext = z.infer<typeof LegionContext>

export const TurnExtraction = z.object({
  concepts: z.array(ExtractedConcept).describe("Technical concepts, technologies, patterns mentioned"),
  decisions: z.array(ExtractedDecision).describe("Choices made or confirmed in this turn"),
  preferences: z.array(ExtractedPreference).describe("User preferences stated or implied"),
  topics: z.array(ExtractedTopic).describe("Topics being discussed and their status"),
  code_references: z.array(ExtractedCodeRef).describe("Code files, functions, classes referenced"),
  intent: z
    .enum(["question", "decision", "exploration", "correction", "instruction", "feedback"])
    .describe("Primary intent of this turn"),
  urgency: z.enum(["low", "normal", "high"]).describe("Urgency level of the turn"),
  legion_context: LegionContext.optional().describe(
    "LEGION entity IDs referenced in this turn — extract UUIDs when engagements, tasks, or delegations are mentioned",
  ),
})
export type TurnExtraction = z.infer<typeof TurnExtraction>
