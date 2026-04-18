# Claude Code Integration

Use your local [Claude Code](https://code.claude.com) CLI as an AI provider in Adorable. This lets you build Angular apps using your Claude Pro/Max subscription instead of an API key.

**Desktop app only.**

## Setup

1. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Log in: `claude login`
3. In Adorable, open **Settings > AI Providers**
4. Click **Claude Code (Local)** and set it as active
5. Click **Check Availability** to verify the CLI is detected
6. Optionally select a model (Sonnet, Opus, Haiku, or a specific version)

No API key needed — Claude Code uses your subscription.

## How It Works

When you send a message in the chat, Adorable:

1. Spawns the `claude` CLI in your project directory
2. Streams text and tool calls back to the chat in real time
3. Detects file writes and updates the preview automatically
4. Passes your conversation context via `--resume` for multi-turn continuity

Claude Code uses its own built-in tools (Read, Write, Edit, Bash, Grep, Glob) for file operations, plus Adorable's MCP tools for browser preview, Figma, and visual editing.

## MCP Tools

Adorable runs an in-process MCP server that Claude Code connects to automatically. This gives Claude Code access to:

### Browser Preview
- `browse_screenshot` — capture the live preview
- `browse_console` — read console errors/warnings
- `browse_evaluate` — run JavaScript in the preview
- `browse_navigate` — navigate to a route
- `browse_click`, `type_text` — interact with the UI
- `inspect_component` — inspect Angular components with ONG annotations
- `inspect_styles`, `inspect_dom`, `measure_element` — inspect elements
- `inspect_routes`, `inspect_signals`, `inspect_errors` — inspect Angular runtime

### Figma Live Bridge
When the Figma plugin is connected:
- `figma_get_selection` — get the currently selected nodes
- `figma_get_fonts` — get fonts with correct CSS names (always call first)
- `figma_get_node` — get a specific node by ID
- `figma_export_node` — export as PNG or SVG
- `figma_search_nodes` — search by name
- `figma_get_variables` — get design tokens

### Skills
Adorable's skills (angular-expert, figma-live) are automatically synced to `.claude/skills/` in your project so Claude Code discovers them natively.

## Model Selection

Choose a model in **Settings > AI Providers > Claude Code** or in the chat model dropdown:

- **Sonnet (latest)** / **Opus (latest)** / **Haiku (latest)** — always uses the newest version
- **Claude Sonnet 4.6**, **Claude Opus 4.6**, etc. — pin to a specific version

## Cost Display

Claude Code uses your subscription, so the chat shows **"subscription"** instead of a dollar amount for token usage.

## Session Management

- Each project maintains a Claude Code session ID for conversation continuity
- **Clear Context** (in chat menu) resets the session so the next message starts fresh
- Sessions expire automatically after inactivity

## CLAUDE.md

Adorable generates a `CLAUDE.md` section in your project root with:

- Project context (Angular 21, standalone components, signals, zoneless)
- Environment info (dev server managed by Adorable, not Electron)
- Restricted files (don't modify package.json, angular.json, runtime scripts)
- Available MCP tools and when to use them
- Component kit instructions (if a kit is active)
- Figma workflow instructions (if bridge is connected)

This section is updated on each generation and persists between sessions.

## Differences from Built-in Providers

| Feature | Anthropic/Gemini | Claude Code |
|---|---|---|
| Auth | API key | CLI subscription |
| Agentic loop | Adorable's `BaseLLMProvider` | Claude Code's own loop |
| File tools | Adorable's write_file/edit_file | Claude Code's Write/Edit |
| Context management | Adorable's pruning | Claude Code's context management |
| Subagents | Not available | Claude Code's Agent/Task tools |
| Plan mode | Built-in | Via prompt instruction |
| Skills | Injected in system prompt | Auto-discovered from .claude/skills/ |

## Limitations

- **Desktop only** — requires the `claude` CLI installed locally
- **No interactive prompts** — Claude Code runs with `--dangerously-skip-permissions`
- **Large Figma selections** — responses are slimmed (colors to hex, defaults stripped) to stay under Claude Code's tool result limit
- **Session timeout** — generations are limited to 15 minutes and $5 per turn
- **No ask_user** — Claude Code handles user interaction via its own conversation, not Adorable's rich question UI

## Troubleshooting

### Claude Code not detected
- Run `claude --version` in a terminal to verify installation
- Make sure you're logged in: `claude login`

### MCP tools not loading
- Check that `.mcp.json` exists in the project root
- Check that `.adorable/mcp-bridge.mjs` exists
- Restart the Adorable desktop app

### Figma tools returning errors
- Verify the Figma plugin shows "Connected" status
- Try disconnecting and reconnecting the plugin
- Check the server logs for bridge errors

### Generation seems stuck
- Check `.adorable/claude-debug.log` in the project directory
- The log shows every event from Claude Code — look for where it stops
- Common causes: large Figma data, API response delays, session context too large
