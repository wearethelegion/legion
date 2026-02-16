#!/usr/bin/env bun

import path from "path"
import fs from "fs"
import { $ } from "bun"
import { fileURLToPath } from "url"
import { Script } from "@opencode-ai/script"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

// Parse CLI arguments
const args = process.argv.slice(2)

function arg(name: string) {
  const prefix = `--${name}=`
  const match = args.find((a) => a.startsWith(prefix))
  if (!match) return undefined
  return match.slice(prefix.length)
}

const apiUrl = arg("legion-api-url")
const outputDir = arg("output-dir") || path.join(dir, "dist")

if (!apiUrl) {
  console.error("Error: --legion-api-url=<url> is required")
  process.exit(1)
}

console.log(`Building macOS .pkg installer`)
console.log(`  Version: ${Script.version}`)
console.log(`  API URL: ${apiUrl}`)
console.log(`  Output:  ${outputDir}`)

// Step 1: Run single-platform build to get the binary
console.log("\n[1/5] Building legion binary...")
await $`bun run script/build.ts --single --skip-install`

// Find the built binary
const platform = process.platform
const arch = process.arch
const pkgName = `opencode-${platform}-${arch}`
const binary = path.join(dir, `dist/${pkgName}/bin/legion`)

if (!fs.existsSync(binary)) {
  console.error(`Binary not found at ${binary}`)
  console.error("Build may have failed. Check output above.")
  process.exit(1)
}

console.log(`  Binary: ${binary}`)

// Step 2: Create staging directory
console.log("\n[2/5] Creating staging directory...")
const staging = path.join(dir, "dist/pkg-staging")
const payload = path.join(staging, "payload/usr/local/bin")
const scripts = path.join(staging, "scripts")

await $`rm -rf ${staging}`
fs.mkdirSync(payload, { recursive: true })
fs.mkdirSync(scripts, { recursive: true })

// Copy binary to payload
fs.copyFileSync(binary, path.join(payload, "legion"))
fs.chmodSync(path.join(payload, "legion"), 0o755)

// Step 3: Generate postinstall script
console.log("\n[3/5] Generating postinstall script...")

const postinstall = `#!/bin/bash
# Legion CLI postinstall — creates/merges ~/.legion/config.json
# This runs as root during .pkg install, so we must find the real user.

REAL_USER="\${SUDO_USER:-\${USER}}"
REAL_HOME="\$(eval echo "~\${REAL_USER}")"
CONFIG_DIR="\${REAL_HOME}/.legion"
CONFIG_FILE="\${CONFIG_DIR}/config.json"

# Fallback: if dscl is available (macOS), resolve home directory reliably
if [ -z "\${REAL_HOME}" ] || [ "\${REAL_HOME}" = "~\${REAL_USER}" ]; then
  if command -v dscl >/dev/null 2>&1; then
    REAL_HOME="\$(dscl . -read /Users/\${REAL_USER} NFSHomeDirectory 2>/dev/null | awk '{print \$2}')"
  fi
fi

if [ -z "\${REAL_HOME}" ] || [ ! -d "\${REAL_HOME}" ]; then
  echo "Warning: Could not determine home directory for user \${REAL_USER}" >&2
  exit 0
fi

# Create config directory
sudo -u "\${REAL_USER}" mkdir -p "\${CONFIG_DIR}"

# New config values to merge
NEW_CONFIG='${JSON.stringify({ legion: { url: apiUrl } })}'

if [ -f "\${CONFIG_FILE}" ]; then
  # Merge with existing config using Python (available on all macOS)
  python3 -c "
import json, sys

existing_path = sys.argv[1]
new_json = sys.argv[2]

with open(existing_path, 'r') as f:
    try:
        existing = json.load(f)
    except (json.JSONDecodeError, ValueError):
        existing = {}

new = json.loads(new_json)

def merge(base, overlay):
    for k, v in overlay.items():
        if k in base and isinstance(base[k], dict) and isinstance(v, dict):
            merge(base[k], v)
        else:
            base[k] = v
    return base

merged = merge(existing, new)

with open(existing_path, 'w') as f:
    json.dump(merged, f, indent=2)
    f.write('\\n')
" "\${CONFIG_FILE}" "\${NEW_CONFIG}"
  echo "Merged legion config into \${CONFIG_FILE}"
else
  # Write new config
  sudo -u "\${REAL_USER}" bash -c "cat > '\${CONFIG_FILE}'" <<CONFIGEOF
\${NEW_CONFIG}
CONFIGEOF
  # Pretty-print the JSON
  python3 -c "
import json, sys
path = sys.argv[1]
with open(path, 'r') as f:
    data = json.load(f)
with open(path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\\n')
" "\${CONFIG_FILE}"
  echo "Created \${CONFIG_FILE}"
fi

# Ensure correct ownership
chown "\${REAL_USER}" "\${CONFIG_DIR}" "\${CONFIG_FILE}"

echo "Legion CLI installed successfully."
echo "  Binary: /usr/local/bin/legion"
echo "  Config: \${CONFIG_FILE}"
exit 0
`

const postinstallPath = path.join(scripts, "postinstall")
fs.writeFileSync(postinstallPath, postinstall)
fs.chmodSync(postinstallPath, 0o755)

// Step 4: Build .pkg with pkgbuild
console.log("\n[4/5] Building .pkg with pkgbuild...")
fs.mkdirSync(outputDir, { recursive: true })

const pkgFile = path.join(outputDir, `legion-${Script.version}-${arch}.pkg`)

await $`pkgbuild \
  --root ${path.join(staging, "payload")} \
  --scripts ${scripts} \
  --identifier com.legion.cli \
  --version ${Script.version} \
  --install-location / \
  ${pkgFile}`

console.log(`  Package: ${pkgFile}`)

// Step 5: Clean up staging
console.log("\n[5/5] Cleaning up...")
await $`rm -rf ${staging}`

console.log(`\nDone! Package ready at: ${pkgFile}`)
console.log(`Install with: sudo installer -pkg ${pkgFile} -target /`)
