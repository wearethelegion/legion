import { createSimpleContext } from "./helper"

export interface LoginResult {
  success: boolean
  projects?: Array<{ id: string; company_id: string; name: string; description: string; company_name: string }>
  error?: string
}

export interface Args {
  model?: string
  agent?: string
  prompt?: string
  continue?: boolean
  sessionID?: string
  fork?: boolean
  onLogin?: (email: string, password: string, serverUrl?: string) => Promise<LoginResult>
  onProjectSelected?: (companyId: string, projectId: string) => void
}

export const { use: useArgs, provider: ArgsProvider } = createSimpleContext({
  name: "Args",
  init: (props: Args) => props,
})
