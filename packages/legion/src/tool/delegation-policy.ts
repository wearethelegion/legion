const TEAM_ORCHESTRATION_TOOLS = new Set([
  "delegate",
  "cancelDelegation",
  "getDelegationStatus",
  "getDelegationResult",
  "listDelegations",
])

/**
 * Only the root lead of a governed Agent Workspace run may use orchestration
 * tools. Child delegations stay specialists, preventing recursive fan-out.
 */
export function canUseWorkspaceTeamTool(
  toolId: string,
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return (
    !!environment.LEGION_DELEGATION_ID &&
    !!environment.LEGION_AGENT_RUN_ID &&
    Number(environment.LEGION_DELEGATION_DEPTH || "1") === 0 &&
    TEAM_ORCHESTRATION_TOOLS.has(toolId)
  )
}
