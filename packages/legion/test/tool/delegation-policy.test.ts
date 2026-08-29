import { describe, expect, test } from "bun:test"
import { canUseWorkspaceTeamTool } from "../../src/tool/delegation-policy"

describe("workspace delegation policy", () => {
  const rootLead = {
    LEGION_DELEGATION_ID: "root-delegation",
    LEGION_AGENT_RUN_ID: "run-1",
    LEGION_DELEGATION_DEPTH: "0",
  }

  test("lets the governed root lead delegate and inspect child results", () => {
    expect(canUseWorkspaceTeamTool("delegate", rootLead)).toBe(true)
    expect(canUseWorkspaceTeamTool("getDelegationResult", rootLead)).toBe(true)
    expect(canUseWorkspaceTeamTool("listDelegations", rootLead)).toBe(true)
  })

  test("prevents recursive fan-out and agent-management mutations", () => {
    expect(
      canUseWorkspaceTeamTool("delegate", {
        ...rootLead,
        LEGION_DELEGATION_DEPTH: "1",
      }),
    ).toBe(false)
    expect(canUseWorkspaceTeamTool("createAgent", rootLead)).toBe(false)
    expect(canUseWorkspaceTeamTool("delegate", {})).toBe(false)
  })
})
