import { TextAttributes } from "@opentui/core"
import { createSignal, For, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useRoute } from "@tui/context/route"
import { useKeyboard } from "@opentui/solid"
import { Logo } from "../component/logo"
import { useArgs } from "@tui/context/args"
import { useLegion } from "@tui/context/legion"
import { setLegionSession } from "@/legion/auth"
import type { ProjectItem } from "@opencode-ai/legion-client"

export function ProjectSelect() {
  const { theme } = useTheme()
  const route = useRoute()
  const args = useArgs()
  const legion = useLegion()

  const projects = () => {
    if (route.data.type !== "project-select") return []
    return route.data.projects
  }

  const [selected, setSelected] = createSignal(0)

  const submit = () => {
    const list = projects()
    const project = list[selected()]
    if (!project) return
    // Set in parent process memory
    setLegionSession(project.company_id, project.id)
    // Push to worker process via RPC
    args.onProjectSelected?.(project.company_id, project.id)
    // Set reactive names for status bar display
    legion.select(project.company_name ?? "", project.name)
    route.navigate({ type: "home" })
  }

  useKeyboard((evt) => {
    const list = projects()
    if (evt.name === "up" || (evt.name === "k" && !evt.ctrl)) {
      evt.preventDefault()
      evt.stopPropagation()
      setSelected((i) => (i > 0 ? i - 1 : list.length - 1))
      return
    }
    if (evt.name === "down" || (evt.name === "j" && !evt.ctrl)) {
      evt.preventDefault()
      evt.stopPropagation()
      setSelected((i) => (i < list.length - 1 ? i + 1 : 0))
      return
    }
    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      submit()
    }
  })

  return (
    <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
      <box flexGrow={1} minHeight={0} />
      <box flexShrink={0}>
        <Logo />
      </box>
      <box height={2} minHeight={0} flexShrink={1} />
      <box width="100%" maxWidth={60} flexShrink={0} gap={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Select a project
        </text>
        <box height={1} />

        <Show when={projects().length > 0} fallback={<text fg={theme.textMuted}>No projects available.</text>}>
          <For each={projects()}>
            {(project: ProjectItem, i) => {
              const active = () => selected() === i()
              return (
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseUp={() => {
                    setSelected(i())
                    submit()
                  }}
                >
                  <text fg={active() ? theme.accent : theme.textMuted}>{active() ? ">" : " "}</text>
                  <box>
                    <text attributes={active() ? TextAttributes.BOLD : 0} fg={active() ? theme.text : theme.textMuted}>
                      {project.name}
                    </text>
                    <Show when={project.company_name}>
                      <text fg={theme.textMuted}>
                        {"  "}
                        {project.company_name}
                      </text>
                    </Show>
                  </box>
                </box>
              )
            }}
          </For>
        </Show>

        <box height={1} />

        <box flexDirection="row">
          <text fg={theme.textMuted}>
            up/down <span style={{ fg: theme.text }}>navigate</span>
            {"  "}enter <span style={{ fg: theme.text }}>select</span>
          </text>
        </box>
      </box>
      <box flexGrow={1} minHeight={0} />
    </box>
  )
}
