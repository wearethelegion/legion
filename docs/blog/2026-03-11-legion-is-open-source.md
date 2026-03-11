# Legion Is Open Source

*March 11, 2026*

Today we're making Legion fully open source under the MIT license.

## What is Legion?

Legion is the persistent intelligence layer for AI development. It gives your AI coding tools a permanent memory, a team of specialists, and the ability to build features autonomously.

Two delivery modes:
- **Legion CLI** — Full terminal coding environment. 75+ LLM providers. 84+ tools. Agent orchestration. Everything native.
- **Legion MCP** — One config file. Connect to Claude Code, Cursor, or any MCP-compatible tool. Same knowledge, same agents, same workflows.

## Why Open Source?

We've been running Legion in production for months — 128+ engagements across 6 cross-dependent projects. The website you're reading this on was built using Legion's own multi-agent workflows.

We open-sourced because:

1. **Developer tools should be open.** You're trusting us with your codebase. You should be able to read every line of code that touches it.
2. **Lock-in is the enemy.** Legion works with 75+ LLM providers. Open source means you're never locked into our infrastructure, our models, or our pricing.
3. **Knowledge should compound publicly.** The same principle that makes Legion powerful — every interaction building on the last — applies to open source development. Every contribution makes Legion better for everyone.

## What's Included

Everything you need to start:

```bash
npm i -g @wearethelegion/legion
legion
```

- Full CLI with TUI (terminal user interface)
- Arthur — your AI orchestrator that decomposes tasks, assigns specialists, and synthesizes results
- Persistent memory — working memory within sessions, permanent memory across sessions
- Knowledge base — structured, semantically searchable, shareable
- Autonomous workflows — markdown-based, natural language triggers
- MCP server for IDE integration (`pip install legion-mcp`)
- Desktop app (beta) for macOS, Windows, and Linux
- 84+ built-in tools
- 75+ LLM provider support
- Client/server architecture — run Legion anywhere, drive it remotely

All under [MIT license](https://github.com/wearethelegion/legion/blob/main/LICENSE).

## Install

```bash
# npm (all platforms)
npm i -g @wearethelegion/legion

# Then just:
legion
```

Pre-built binaries available for macOS (ARM64, Intel), Linux (x64, ARM64), and Windows.

## MCP Integration

Connect Legion's intelligence to your IDE:

```bash
pip install legion-mcp
```

Works with Cursor, Windsurf, Claude Code, and any MCP-compatible editor. One config change and your editor has access to Legion's agents, knowledge, and memory.

## The Five Shifts

| Before | After |
|--------|-------|
| Re-explain everything every session | Instant context from persistent knowledge |
| One AI, one task, you coordinate | Unlimited specialists, Arthur orchestrates |
| Output vanishes when session ends | Every cycle compounds searchable knowledge |
| Knowledge walks out with people | Shared knowledge base, seamless handoffs |
| You are the workflow — every step manual | Say "build this" — autonomous pipeline |

## What's Next

- **Homebrew formula** — `brew install legion` coming soon
- **Docker image** — Zero-install trial via `docker run`
- **More specialist agents** — Community-contributed agent templates
- **Enterprise features** — Multi-tenant RBAC, audit trails, tenant isolation

## Get Involved

- ⭐ [Star us on GitHub](https://github.com/wearethelegion/legion)
- 💬 [Join Discord](https://discord.gg/eX5GqGx4)
- 📖 [Read the docs](https://wearethelegion.com/docs)
- 🐛 [Report issues](https://github.com/wearethelegion/legion/issues)
- 🤝 [Contribute](https://github.com/wearethelegion/legion/blob/main/CONTRIBUTING.md)

We built Legion to make AI development dramatically better. Now it's yours too.

— The Legion Team ⚔️
