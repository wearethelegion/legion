import { createSignal } from "solid-js"
import { createSimpleContext } from "./helper"

export const { use: useLegion, provider: LegionProvider } = createSimpleContext({
  name: "Legion",
  init: () => {
    const [company, setCompany] = createSignal("")
    const [project, setProject] = createSignal("")

    return {
      company,
      project,
      select(companyName: string, projectName: string) {
        setCompany(companyName)
        setProject(projectName)
      },
    }
  },
})
