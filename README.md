# Legion

[![npm version](https://img.shields.io/npm/v/@wearethelegion/legion?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@wearethelegion/legion)
[![GitHub stars](https://img.shields.io/github/stars/wearethelegion/legion?style=flat-square)](https://github.com/wearethelegion/legion/stargazers)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Discord](https://img.shields.io/discord/1480964626488361135?style=flat-square&logo=discord&logoColor=white&label=Discord&color=5865F2)](https://discord.gg/eX5GqGx4)
[![GitHub release](https://img.shields.io/github/v/release/wearethelegion/legion?style=flat-square)](https://github.com/wearethelegion/legion/releases)

**The persistent intelligence layer for AI development.**

Not a replacement for coding tools — the layer underneath that makes them dramatically better.

---

## What is Legion?

Legion is an AI-powered development tool for your terminal. It combines autonomous agents, persistent memory, structured knowledge, and composable workflows into a single CLI that makes every AI interaction smarter than the last.

### The Four Pillars

- 🤖 **Agents** — Autonomous AI agents that understand your codebase and work alongside you
- 🧠 **Knowledge** — Structured intelligence that persists across sessions and tools
- 💾 **Memory** — Long-term context that makes every interaction smarter
- ⚡ **Workflows** — Composable pipelines that connect your AI tools into a unified system

## Quick Start

### Install

```bash
npm i -g @wearethelegion/legion
```

### Run

```bash
legion
```

That's it. Legion will detect your project, load context, and you're ready to go.

### Configuration

Create a `legion.json` in your project root (or `~/.config/legion/config.json` for global config):

```json
{
  "provider": {
    "name": "anthropic",
    "model": "claude-sonnet-4-20250514"
  }
}
```

Legion supports **any provider**: Anthropic, OpenAI, Google, local models, and more. You're never locked in.

## Features

### Dual Delivery Modes

1. **CLI Native** — High-performance terminal UI with full agent capabilities
2. **MCP Server** — Connect Legion's intelligence layer to any MCP-compatible editor (Cursor, Windsurf, etc.)

### Built-in Agents

Switch between agents with the `Tab` key:

- **build** — Default, full-access agent for development work
- **plan** — Read-only agent for analysis and code exploration (denies file edits, asks before running commands)
- **@general** — Subagent for complex searches and multistep tasks

### Desktop App (Beta)

Legion is also available as a desktop application for macOS, Windows, and Linux.

### Why Legion?

- **100% open source** (MIT)
- **Provider agnostic** — Use Claude, OpenAI, Google, local models, or any provider
- **Persistent memory** — Context that survives across sessions
- **LSP support** out of the box
- **Terminal-first** — Built by terminal enthusiasts, pushing the limits of what's possible in the TUI
- **Client/server architecture** — Run Legion on your machine, drive it remotely

## Documentation

For full configuration and usage docs, visit [wearethelegion.com](https://wearethelegion.com).

## Contributing

If you're interested in contributing to Legion, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

## License

MIT — see [LICENSE](./LICENSE)

---

🌐 [wearethelegion.com](https://wearethelegion.com)
