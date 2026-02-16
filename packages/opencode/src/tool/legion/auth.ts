import z from "zod"
import { Tool } from "../tool"
import { client, output, companyId, projectId } from "./index"

const WhoAmITool = Tool.define("whoAmI", {
  description:
    "Identity bootstrap. Returns agent identity, skills, available agents, and sets working context. Call at session start or to re-anchor identity.",
  parameters: z.object({
    agent_id: z.string().optional().describe("Agent UUID to become a specific agent"),
  }),
  async execute(params) {
    const result = await client().whoAmI({
      companyId: companyId(),
      agentId: params.agent_id,
      projectId: projectId(),
    })
    return output(result)
  },
})

const AuthenticateUserTool = Tool.define("authenticateUser", {
  description: "Authenticate with LEGION and get available projects. Usually auto-called; use to refresh token.",
  parameters: z.object({}),
  async execute() {
    const result = await client().authenticate()
    return output(result)
  },
})

const GetProjectsTool = Tool.define("getProjects", {
  description: "Get list of available projects for the authenticated user.",
  parameters: z.object({}),
  async execute() {
    const c = client()
    return output({
      status: "success",
      projects_count: c.userProjects.length,
      projects: c.userProjects,
    })
  },
})

const WhereAmITool = Tool.define("whereAmI", {
  description: "Discover available companies and projects the user has access to.",
  parameters: z.object({}),
  async execute() {
    const c = client()
    const companies = new Map<string, string>()
    for (const p of c.userProjects) {
      if (p.company_id && !companies.has(p.company_id)) companies.set(p.company_id, p.company_name ?? p.company_id)
    }
    return output({
      status: "success",
      companies: [...companies.entries()].map(([id, name]) => ({ id, name })),
      projects: c.userProjects,
      hint: "Use whoAmI(company_id, project_id) to set your working context.",
    })
  },
})

export const AuthTools = [WhoAmITool, AuthenticateUserTool, GetProjectsTool, WhereAmITool]
