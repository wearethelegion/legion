export function delegationProcessOptions(platform: NodeJS.Platform = process.platform) {
  return {
    detached: platform !== "win32",
    windowsHide: platform === "win32",
  }
}
