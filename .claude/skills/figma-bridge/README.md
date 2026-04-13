# Figma Bridge Skill

Use Claude Code to read and interact with a live Figma file — selection, node specs, design tokens — without Figma Dev Mode or a paid Figma plan.

## What it does

Lets Claude answer questions like:

- *"What am I looking at in Figma right now?"*
- *"Pull the design tokens from this Figma file and write them as CSS variables"*
- *"Compare my current Figma selection to the Button component in this repo"*
- *"What's the padding on the selected frame?"*
- *"List all the color tokens defined in this file"*

Claude gets real-time access to your currently-selected Figma node (bounds, fills, strokes, auto-layout, effects) and the file's design tokens (local variables).

## Requirements

- **Node 22+** (the standalone bridge server uses built-in APIs)
- **Figma desktop or web** with the Adorable plugin installed

## Quick start

### 1. Start the bridge server

Leave this running in a terminal (or background it):

```bash
.claude/skills/figma-bridge/scripts/bridge-server.mjs
```

You should see:
```
[bridge] listening on http://localhost:7777
[bridge] point Figma plugin to ws://localhost:7777/ws/figma-bridge
```

### 2. Connect the Figma plugin (one-time)

In Figma, open the Adorable plugin:

1. Expand **Advanced: server URL**
2. Enter: `ws://localhost:7777/ws/figma-bridge`
3. Click **Save**
4. Type anything in the connection code field (e.g. `LOCAL`) and click **Connect**

The plugin's bridge status should turn green ("Connected"). The URL and connection token persist via Figma's `clientStorage` — **you only do this once per machine**. Next time you open the plugin, it auto-reconnects as long as the bridge server is running.

The server terminal will log:
```
[bridge] plugin connected: My Design File (xxxxx)
```

### 3. Use it from Claude Code

Just ask Claude things like:

> "What am I looking at in Figma?"

> "Extract the design tokens from Figma and write them as CSS variables in src/styles/tokens.css"

> "The selected Figma frame should match the Card component — compare them and list the deviations"

Claude will invoke the skill automatically.

## Manual usage (bypass Claude)

You can also drive the CLI yourself:

```bash
# status / selection
.claude/skills/figma-bridge/scripts/bridge.mjs status
.claude/skills/figma-bridge/scripts/bridge.mjs selection

# specific node
.claude/skills/figma-bridge/scripts/bridge.mjs get-node 1:42

# design tokens
.claude/skills/figma-bridge/scripts/bridge.mjs get-variables

# help
.claude/skills/figma-bridge/scripts/bridge.mjs help
```

## Modes

The skill auto-detects which bridge to talk to:

| Mode | How | When |
|---|---|---|
| **Standalone** (default) | `scripts/bridge-server.mjs` on :7777 | Using Claude Code alone, no Adorable server |
| **Adorable** | Adorable server on :3333 | You're working inside Adorable and it's already running |

If both are running, it prefers the standalone server. Force a mode with `BRIDGE_MODE=standalone` or `BRIDGE_MODE=adorable`.

## Troubleshooting

**`No bridge server reachable`** — neither the standalone server nor Adorable is running. Start one:
```bash
.claude/skills/figma-bridge/scripts/bridge-server.mjs
```

**`Figma plugin not connected`** — the server is running but the plugin hasn't paired. Check:
- The plugin is open in Figma
- The plugin's server URL is `ws://localhost:7777/ws/figma-bridge`
- The green "Connected" badge is showing in the plugin
- The server terminal shows `[bridge] plugin connected: ...`

**Plugin shows "Disconnected"** — if you restarted the bridge server, give the plugin a moment; it auto-reconnects with exponential backoff. If it doesn't, click Disconnect → Connect in the plugin.

**`Timed out after 15s`** — the plugin received the command but didn't respond. Usually means the command errored silently; check the Figma plugin's dev console (Plugins → Development → Open Console).

**Multiple Figma files open** — the bridge has one active connection at a time. Opening the plugin in a new file replaces the previous connection. The server will log a new "plugin connected" line for whichever file you're currently in.

## How it works

```
┌──────────────┐       WebSocket        ┌──────────────────┐
│  Figma Plugin│ ◄──────────────────► │  bridge-server   │
│  (in Figma)  │    ws://localhost:   │  (Node, :7777)   │
│              │    7777/ws/figma-    │                  │
│              │    bridge            │                  │
└──────────────┘                       └────────┬─────────┘
                                                │ HTTP
                                                ▼
                                       ┌──────────────────┐
                                       │   bridge.mjs     │
                                       │   (CLI wrapper)  │
                                       └────────┬─────────┘
                                                │
                                                ▼
                                       ┌──────────────────┐
                                       │   Claude Code    │
                                       └──────────────────┘
```

- The **plugin** runs inside Figma and knows about the current selection, nodes, and variables
- The **bridge server** is a tiny Node process (zero dependencies) that accepts a WebSocket connection from the plugin and exposes an HTTP API
- **`bridge.mjs`** is the CLI client that Claude invokes — it hits the HTTP API and returns structured JSON
- Claude reads the JSON and acts on it

All local, nothing leaves your machine.

## Why not Figma's own Dev Mode MCP?

Figma ships an official Dev Mode MCP server for AI code-gen, but it has limitations this skill doesn't:

| | This skill | Figma Dev Mode MCP |
|---|---|---|
| Figma plan required | Any (including **free**) | Paid Dev seat |
| Figma Desktop required | No (Desktop + Web) | Yes, Desktop only |
| Real-time selection events | ✅ | ❌ (pull-only) |
| Setup | Run one script + paste URL | Enable Dev Mode |
| Code-gen built in | ❌ (raw structured data) | ✅ |

They're complementary. This skill is best for **AI agents that have their own code-gen logic and want real-time, structured access to Figma**.

## Files

```
.claude/skills/figma-bridge/
├── SKILL.md                  Instructions for Claude (auto-loaded when skill is active)
├── README.md                 This file (human docs)
└── scripts/
    ├── bridge-server.mjs     Standalone WebSocket + HTTP bridge server
    └── bridge.mjs            CLI client (Claude invokes this)
```
