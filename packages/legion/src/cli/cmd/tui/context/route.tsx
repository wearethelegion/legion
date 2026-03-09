import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import type { PromptInfo } from "../component/prompt/history"
import type { ProjectItem } from "@wearethelegion/legion-client"

export type HomeRoute = {
  type: "home"
  initialPrompt?: PromptInfo
}

export type SessionRoute = {
  type: "session"
  sessionID: string
  initialPrompt?: PromptInfo
}

export type LoginRoute = {
  type: "login"
}

export type ProjectSelectRoute = {
  type: "project-select"
  projects: ProjectItem[]
}

export type Route = HomeRoute | SessionRoute | LoginRoute | ProjectSelectRoute

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: () => {
    const [store, setStore] = createStore<Route>(
      process.env["LEGION_ROUTE"]
        ? JSON.parse(process.env["LEGION_ROUTE"])
        : {
            type: "home",
          },
    )

    return {
      get data() {
        return store
      },
      navigate(route: Route) {
        console.log("navigate", route)
        setStore(route)
      },
    }
  },
})

export type RouteContext = ReturnType<typeof useRoute>

export function useRouteData<T extends Route["type"]>(type: T) {
  const route = useRoute()
  return route.data as Extract<Route, { type: typeof type }>
}
