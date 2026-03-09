import type { Tool } from "../tool"
import { getLegionClient, getLegionCompanyId, getLegionProjectId } from "../../legion/auth"
import z from "zod"
import { Log } from "../../util/log"

import { getSessionId } from "./session-id"

const log = Log.create({ service: "legion.tool" })

export function client() {
  const c = getLegionClient()
  if (!c) throw new Error("LEGION not available")
  const sid = getSessionId()
  if (sid) c.sessionId = sid
  return c
}

export function companyId() {
  const id = process.env.LEGION_COMPANY_ID || getLegionCompanyId()
  if (!id) {
    log.warn("companyId() resolved null — LEGION company not selected")
  } else {
    log.debug("companyId()", { company_id: id })
  }
  if (!id) throw new Error("LEGION company not selected")
  return id
}

export function projectId() {
  const id = process.env.LEGION_PROJECT_ID || getLegionProjectId()
  if (!id) {
    log.warn("projectId() resolved null — LEGION project not selected")
  } else {
    log.debug("projectId()", { project_id: id })
  }
  if (!id) throw new Error("LEGION project not selected")
  return id
}

export function output(data: any) {
  return { title: "", output: JSON.stringify(data, null, 2), metadata: {} }
}

/** z.record(z.string()) infers Record<string, unknown>; this helper gives Record<string, string> */
export const stringRecord = z.record(z.string(), z.string())

import { AuthTools } from "./auth"
import { AgentTools } from "./agent"
import { WorkflowTools } from "./workflow"
import { KnowledgeTools } from "./knowledge"
import { CodeTools } from "./code"
import { ExpertiseTools } from "./expertise"
import { LessonTools } from "./lessons"
import { EngagementTools } from "./engagement"
import { MemoryTools } from "./memory"
import { TaskTools } from "./task"
import { DelegationTools } from "./delegation"
import { WhatIKnowTools } from "./what-i-know"
import { ContextResetTools } from "./context-reset"

export const AllLegionTools: Tool.Info[] = [
  ...AuthTools,
  ...AgentTools,
  ...WorkflowTools,
  ...KnowledgeTools,
  ...CodeTools,
  ...ExpertiseTools,
  ...LessonTools,
  ...EngagementTools,
  ...MemoryTools,
  ...TaskTools,
  ...DelegationTools,
  ...WhatIKnowTools,
  ...ContextResetTools,
]
