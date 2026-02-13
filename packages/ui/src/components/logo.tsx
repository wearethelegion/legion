import { ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M12 16H4V8H12V16Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M60 80H20V40H60V80Z" fill="var(--icon-base)" />
      <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        {/* L */}
        <path d="M18 30H6V18H18V30Z" fill="var(--icon-weak-base)" />
        <path d="M6 6H0V36H24V30H6V6Z" fill="var(--icon-strong-base)" />
        {/* E */}
        <path d="M48 24V30H36V24H48Z" fill="var(--icon-weak-base)" />
        <path d="M48 24H36V30H48V36H30V6H48V12H36V18H48V24ZM36 18H42V12H36V18Z" fill="var(--icon-strong-base)" />
        {/* G */}
        <path d="M78 30H66V24H78V30Z" fill="var(--icon-weak-base)" />
        <path d="M78 12H66V30H78V24H72V18H78V36H60V6H78V12Z" fill="var(--icon-strong-base)" />
        {/* I */}
        <path d="M90 6H84V36H90V6Z" fill="var(--icon-strong-base)" />
        {/* O */}
        <path d="M114 30H102V18H114V30Z" fill="var(--icon-weak-base)" />
        <path d="M114 12H102V30H114V12ZM120 36H96V6H120V36Z" fill="var(--icon-strong-base)" />
        {/* N */}
        <path d="M144 18H138V12H144V18Z" fill="var(--icon-weak-base)" />
        <path d="M126 6H132V18H138V24H144V6H150V36H144V24H138V18H132V36H126V6Z" fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}
