import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { createSignal, onMount, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useRoute } from "@tui/context/route"
import { useKeyboard } from "@opentui/solid"
import { Logo } from "../component/logo"
import { useArgs } from "@tui/context/args"

export function Login() {
  const { theme } = useTheme()
  const route = useRoute()
  const args = useArgs()

  const [focused, setFocused] = createSignal<"email" | "password">("email")
  const [error, setError] = createSignal("")
  const [loading, setLoading] = createSignal(false)

  let email: TextareaRenderable
  let password: TextareaRenderable

  const submit = () => {
    if (loading()) return
    const addr = email.plainText.trim()
    const pass = password.plainText.trim()
    if (!addr || !pass) {
      setError("Email and password are required")
      return
    }
    if (!args.onLogin) {
      setError("Login handler not available")
      return
    }
    setError("")
    setLoading(true)
    console.error("[LOGIN] submit: calling onLogin RPC...")
    args
      .onLogin(addr, pass)
      .then((result) => {
        console.error("[LOGIN] onLogin returned:", JSON.stringify(result).slice(0, 200))
        setLoading(false)
        if (!result.success) {
          setError(result.error ?? "Authentication failed.")
          return
        }
        route.navigate({ type: "project-select", projects: result.projects ?? [] })
      })
      .catch((err: unknown) => {
        console.error("[LOGIN] onLogin error:", err instanceof Error ? err.message : String(err))
        setLoading(false)
        setError(err instanceof Error ? err.message : "Authentication failed unexpectedly.")
      })
  }

  const switchFocus = () => {
    if (focused() === "email") {
      setFocused("password")
      password.focus()
    } else {
      setFocused("email")
      email.focus()
    }
  }

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      route.navigate({ type: "home" })
      evt.stopPropagation()
      return
    }
    if (evt.name === "tab") {
      evt.preventDefault()
      evt.stopPropagation()
      switchFocus()
      return
    }
    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      if (focused() === "email") {
        switchFocus()
        return
      }
      submit()
    }
  })

  onMount(() => {
    setTimeout(() => {
      if (!email || email.isDestroyed) return
      email.focus()
    }, 1)
  })

  return (
    <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
      <box flexGrow={1} minHeight={0} />
      <box flexShrink={0}>
        <Logo />
      </box>
      <box height={2} minHeight={0} flexShrink={1} />
      <box width="100%" maxWidth={50} flexShrink={0} gap={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Sign in to LEGION
        </text>
        <box height={1} />

        <text fg={theme.textMuted}>Email</text>
        <box borderStyle="single" borderColor={focused() === "email" ? theme.borderActive : theme.border}>
          <textarea
            height={1}
            ref={(val: TextareaRenderable) => (email = val)}
            placeholder="you@example.com"
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.text}
          />
        </box>

        <text fg={theme.textMuted}>Password</text>
        <box borderStyle="single" borderColor={focused() === "password" ? theme.borderActive : theme.border}>
          <textarea
            height={1}
            ref={(val: TextareaRenderable) => (password = val)}
            placeholder="password"
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.text}
          />
        </box>

        <Show when={error()}>
          <text fg={theme.error}>{error()}</text>
        </Show>

        <box height={1} />

        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>
            enter <span style={{ fg: theme.text }}>submit</span>
            {"  "}tab <span style={{ fg: theme.text }}>next field</span>
            {"  "}esc <span style={{ fg: theme.text }}>skip</span>
          </text>
        </box>

        <Show when={loading()}>
          <text fg={theme.accent}>Authenticating...</text>
        </Show>
      </box>
      <box flexGrow={1} minHeight={0} />
    </box>
  )
}
