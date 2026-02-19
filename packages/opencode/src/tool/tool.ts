import z from "zod"
import type { MessageV2 } from "../session/message-v2"
import type { Agent } from "../agent/agent"
import type { PermissionNext } from "../permission/next"
import { Truncate } from "./truncation"
import { setSessionId } from "./legion/session-id"
import { setEngagementId, getEngagementId } from "./legion/engagement-id"
import { isLegionAvailable } from "../legion/auth"
import { shouldAudit, auditToolExecution } from "./legion/audit"

/**
 * Tools that are purely read-only or bootstrap — exempt from the engagement_id guard.
 * Every tool NOT in this set must include `engagement_id` in its arguments.
 */
const READ_ONLY_TOOLS = new Set([
  // Core reads
  "read",
  "glob",
  "grep",
  "webfetch",
  "websearch",
  "codesearch",
  "skill",
  "question",
  "todowrite",
  "todoread",
  "invalid",
  "lsp",
  "plan_enter",
  "plan_exit",
  // LEGION bootstrap / reads
  "createEngagement", // exempt: this IS how you get an engagement_id
  "whoAmI",
  "authenticateUser",
  "getProjects",
  "whereAmI",
  "getEngagement",
  "listEngagements",
  "resumeEngagement",
  "getEntry",
  "searchEntries",
  "getTask",
  "listTasks",
  "queryKnowledge",
  "fastQuery",
  "searchByTags",
  "exploreGraph",
  "findSimilarCode",
  "analyzeImpact",
  "traceExecutionFlow",
  "queryExpertise",
  "listExpertise",
  "getExpertise",
  "queryLessons",
  "recall",
  "getActiveWorkStatus",
  "getDelegationStatus",
  "getDelegationResult",
  "listDelegations",
  "listWorkflows",
  "activateWorkflow",
  "getAgentSkills",
  "searchSkillDetails",
  "getSkillSections",
  "getSkillContent",
  "whatIKnow",
])

export namespace Tool {
  interface Metadata {
    [key: string]: any
  }

  export interface InitContext {
    agent?: Agent.Info
  }

  export type Context<M extends Metadata = Metadata> = {
    sessionID: string
    messageID: string
    agent: string
    abort: AbortSignal
    callID?: string
    extra?: { [key: string]: any }
    messages: MessageV2.WithParts[]
    metadata(input: { title?: string; metadata?: M }): void
    ask(input: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">): Promise<void>
  }
  export interface Info<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    id: string
    init: (ctx?: InitContext) => Promise<{
      description: string
      parameters: Parameters
      execute(
        args: z.infer<Parameters>,
        ctx: Context,
      ): Promise<{
        title: string
        metadata: M
        output: string
        attachments?: Omit<MessageV2.FilePart, "id" | "sessionID" | "messageID">[]
      }>
      formatValidationError?(error: z.ZodError): string
    }>
  }

  export type InferParameters<T extends Info> = T extends Info<infer P> ? z.infer<P> : never
  export type InferMetadata<T extends Info> = T extends Info<any, infer M> ? M : never

  const WRAPPED = Symbol("tool.wrapped")

  export function define<Parameters extends z.ZodType, Result extends Metadata>(
    id: string,
    init: Info<Parameters, Result>["init"] | Awaited<ReturnType<Info<Parameters, Result>["init"]>>,
  ): Info<Parameters, Result> {
    return {
      id,
      init: async (initCtx) => {
        const toolInfo = init instanceof Function ? await init(initCtx) : init
        // Guard: only wrap execute once — init() may be called N times (once per agent)
        if ((toolInfo.execute as any)[WRAPPED]) return toolInfo
        const execute = toolInfo.execute
        const wrapped: typeof execute = async (args, ctx) => {
          try {
            toolInfo.parameters.parse(args)
          } catch (error) {
            if (error instanceof z.ZodError && toolInfo.formatValidationError) {
              throw new Error(toolInfo.formatValidationError(error), { cause: error })
            }
            throw new Error(
              `The ${id} tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.`,
              { cause: error },
            )
          }
          // Propagate opencode session ID so every LEGION gRPC call carries x-session-id
          setSessionId(ctx.sessionID)

          // Engagement guard: mutation tools must carry engagement_id when LEGION is active
          // In delegation mode (headless subprocess), auto-inject from env var
          if (isLegionAvailable() && !READ_ONLY_TOOLS.has(id)) {
            const eid =
              args && typeof args === "object" && "engagement_id" in args
                ? (args as Record<string, unknown>).engagement_id
                : process.env.LEGION_ENGAGEMENT_ID
            if (!eid || typeof eid !== "string") {
              throw new Error(
                `The ${id} tool requires an "engagement_id" parameter. ` +
                  `Create an engagement first with createEngagement, then pass the returned engagement_id to every mutation tool call.`,
              )
            }
            setEngagementId(eid)
          }

          const result = await execute(args, ctx)

          // Auto-audit: create note entry for modification tools
          const eid = getEngagementId()
          if (shouldAudit(id, eid)) {
            auditToolExecution(id, args as Record<string, unknown>, result, eid!, ctx.callID)
          }

          // skip truncation for tools that handle it themselves
          if (result.metadata.truncated !== undefined) {
            return result
          }
          const truncated = await Truncate.output(result.output, {}, initCtx?.agent)
          return {
            ...result,
            output: truncated.content,
            metadata: {
              ...result.metadata,
              truncated: truncated.truncated,
              ...(truncated.truncated && { outputPath: truncated.outputPath }),
            },
          }
        }
        ;(wrapped as any)[WRAPPED] = true
        toolInfo.execute = wrapped
        return toolInfo
      },
    }
  }
}
