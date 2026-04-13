---
name: figma-bridge
description: Interact with a live-connected Figma file via a local bridge. Use when the user wants to inspect Figma selection, read node structure/styles, extract design tokens (variables), or drive the Figma cursor. Works fully standalone (no Adorable server required) or with Adorable if it's running.
---

# Figma Live Bridge

Lets Claude Code read what the user is doing in Figma — current selection, node specs, design tokens — without needing Figma Dev Mode or a paid Figma plan.

## Two modes (auto-detected)

1. **Standalone** (default, zero setup) — skill runs its own tiny bridge server, plugin connects directly to it. No Adorable needed.
2. **Adorable** — if Adorable's server is running on :3333, the skill talks to it instead.

The CLI picks whichever is running.

## Setup (one-time)

**1. Start the standalone bridge server:**
```bash
scripts/bridge-server.mjs
```
Runs on `http://localhost:7777` by default. Leave it running in a terminal (or background it).

**2. Point the Adorable Figma plugin at it:**
- Open the plugin in Figma
- Expand "Advanced: server URL"
- Enter: `ws://localhost:7777/ws/figma-bridge`
- Click Save
- Click Connect (any code works in standalone mode — try `LOCAL`)

Connection persists across plugin sessions via `clientStorage`. After this one-time setup, the plugin auto-reconnects whenever the standalone server is running.

## Commands

All commands use `scripts/bridge.mjs` relative to this skill's directory.

### Check connection
```bash
scripts/bridge.mjs status
```
Returns `{ connected: true, fileKey, fileName }` or `{ connected: false }`. **Always run this first.**

### Get current selection
```bash
scripts/bridge.mjs selection
```
Returns selected Figma nodes with full structure (bounds, fills, strokes, effects, auto-layout). Images stripped.

Use when the user says *"look at what I've selected"*, *"analyze this frame"*, *"what did I select?"*.

### Get a specific node
```bash
scripts/bridge.mjs get-node <nodeId>
```
Use when the user references a node by ID, or when drilling into a child of a previously-fetched node.

### Get fonts used in the file
```bash
scripts/bridge.mjs get-fonts
```
Returns all fonts used in the current Figma page: families, styles, whether it's an icon font, CDN URLs, and Google Fonts links. Icon fonts include sample Unicode codepoints.

**Always run this before generating code** to know which exact fonts and icon libraries to use. Do NOT substitute fonts — use the exact ones from the response, loading them via the provided CDN/Google Fonts URLs.

For icon fonts (where `isIconFont: true`), TEXT nodes will also have `iconCodepoint` (e.g. `"U+F015"`) and `isIconFont: true`. Use these codepoints directly in CSS (`content: '\f015'`) with the font-family from the response.

### Extract design tokens (variables)
```bash
scripts/bridge.mjs get-variables
```
Returns Figma local variables as structured JSON: collections, modes, tokens with values per mode. Colors resolved to `#hex`/`rgba()`, aliases followed.

Use when the user asks about design tokens, theme colors, spacing scales, typography, or wants to sync Figma variables into code.

### Start the standalone server (shortcut)
```bash
scripts/bridge.mjs serve
```
Equivalent to running `scripts/bridge-server.mjs`.

## Typical workflows

### "What am I looking at?"
```bash
scripts/bridge.mjs status           # confirm connection
scripts/bridge.mjs selection        # fetch selection
```
Describe what you see (layout, children, dimensions) to the user.

### "Build this Figma design as code"
```bash
scripts/bridge.mjs get-fonts        # ALWAYS first — get exact fonts + CDN links
scripts/bridge.mjs selection        # get the structure
scripts/bridge.mjs get-node <id> 2  # drill into children as needed
```
Use the fonts from `get-fonts` response verbatim. For icon fonts, use the `iconCodepoint` from TEXT nodes as CSS `content` values with the exact font-family. Never substitute icon fonts.

### "Pull the design tokens from Figma"
```bash
scripts/bridge.mjs get-variables
```
Transform to CSS custom properties (`color/brand/primary` → `--color-brand-primary`) and write to the appropriate theme file in the project.

### "Compare this selection to the implementation"
```bash
scripts/bridge.mjs selection        # get Figma bounds/styles
```
Read the matching component in the codebase, diff (padding, colors, spacing), report deviations.

## Tips

- **Node IDs** look like `1:2` or `123:456` — pass them exactly as returned.
- **Keep token usage low**: outputs can be large. Script strips images and truncates child depth. Still summarize, don't dump raw JSON to the user.
- **Figma plan**: works on **any Figma plan, including free** (unlike Dev Mode MCP).
- **Not connected?** If `status` returns `{ connected: false }`:
  - Check the standalone server terminal — did the plugin connect? Should print "plugin connected: ..."
  - In the plugin, verify the server URL is `ws://localhost:7777/ws/figma-bridge` and the green "Connected" badge is showing

## Environment variables

- `BRIDGE_MODE` — force `standalone` or `adorable` (otherwise auto-detect)
- `BRIDGE_SERVER` — standalone server URL (default `http://localhost:7777`)
- `ADORABLE_SERVER` — Adorable server URL (default `http://localhost:3333`)
- `ADORABLE_TOKEN` — JWT for Adorable mode (get from browser: `localStorage.getItem("adorable_token")`)
- `PORT` (for `bridge-server.mjs`) — server port (default 7777)
