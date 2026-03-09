import { $ } from "bun"

import { copyBinaryToSidecarFolder, getCurrentSidecar, windowsify } from "./utils"

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE

const sidecarConfig = getCurrentSidecar(RUST_TARGET)

const binaryPath = windowsify(`../legion/dist/${sidecarConfig.ocBinary}/bin/legion`)

await (sidecarConfig.ocBinary.includes("-baseline")
  ? $`cd ../legion && bun run build --single --baseline`
  : $`cd ../legion && bun run build --single`)

await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)
