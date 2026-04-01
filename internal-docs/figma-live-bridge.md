# Figma Live Bridge

## Overview

The Figma Live Bridge is a real-time bidirectional connection between Figma Desktop and Adorable Desktop via WebSocket. It allows the AI to directly read from and control the user's Figma document — no manual imports or exports needed.

This is **additive** to the existing Figma integration (import via plugin export, URL-based import). The existing workflow is untouched.

**Desktop-only** for now (requires both Figma Desktop and Adorable Desktop running locally).

## Architecture

```
Figma Plugin code.ts ←postMessage→ Plugin UI iframe ←WebSocket→ Adorable Server ←HTTP/SSE→ Client
                                                                       ↕
                                                                 AI Tool Execution
```

- **Figma plugin `code.ts`** has full Figma API access (selection, node traversal, export, viewport control) but no network access
- **Plugin UI iframe** acts as the network relay — connects via WebSocket to `ws://localhost:3333/ws/figma-bridge`
- **Adorable Server** manages connections, routes commands, and exposes Figma tools to the AI agentic loop
- **Adorable Client** shows live connection status and real-time Figma selection via SSE

## Connection Flow

1. User clicks **"Connect Figma Plugin"** in Adorable's Figma panel → generates a 6-character connection code
2. User enters the code in the Figma plugin's **Live Bridge** section and clicks **Connect**
3. Plugin connects via WebSocket: `ws://localhost:3333/ws/figma-bridge?code=XXXXXX`
4. Server verifies the code, upgrades to WebSocket, and sends back a JWT for future reconnections
5. Plugin sends a `figma:hello` message with file info
6. Both sides show "Connected" status — selection changes sync in real-time

On reconnect (plugin reopened, Figma restarted), the plugin uses the stored JWT token instead of a new code.

## AI Tools

When the bridge is connected, 5 additional tools become available to the AI during generation:

| Tool | Type | Description |
|------|------|-------------|
| `figma_get_selection` | Read | Get the current Figma selection with node structure and PNG images |
| `figma_get_node` | Read | Get a specific node by ID with structure and optional PNG export |
| `figma_export_node` | Read | Export any node as a PNG image |
| `figma_search_nodes` | Read | Search nodes by name in the current Figma page (up to 50 results) |
| `figma_select_node` | Write | Select a node in Figma and scroll/zoom it into view |

Read tools are parallelizable (can run concurrently). `figma_select_node` is sequential (mutates Figma state).

The AI also receives system prompt instructions on how to use these tools effectively (design-to-code workflow, visual comparison, finding matching elements).

## Use Cases

### 1. Implement a Figma design

> User selects a frame in Figma, then types in Adorable: *"Implement this design"*

The AI:
1. Calls `figma_get_selection` to get the frame structure + PNG screenshot
2. Analyzes the design (layout, colors, typography, spacing)
3. Generates Angular components that match the design
4. Uses `browse_screenshot` (CDP) to compare the result with the Figma export
5. Iterates until it matches

### 2. Fix UI to match Figma

> User has an existing app and a Figma design. Selects the Figma frame and types: *"Make my header match the selected frame"*

The AI:
1. Calls `figma_get_selection` to get the target design
2. Calls `browse_screenshot` to capture the current app state
3. Compares both visually — identifies differences (colors, spacing, sizing, etc.)
4. Makes targeted code fixes
5. Re-screenshots to verify

### 3. Find matching element in Figma

> User is looking at their app and types: *"Select the matching element in Figma for the sidebar navigation"*

The AI:
1. Takes a `browse_screenshot` of the app to identify the sidebar
2. Calls `figma_search_nodes` with terms like "sidebar", "navigation", "nav"
3. Calls `figma_export_node` on candidates to visually compare
4. Calls `figma_select_node` on the best match — Figma jumps to that element

### 4. Design audit / drift detection

> User types: *"Compare every component on this page with its Figma counterpart and list all differences"*

The AI:
1. Screenshots the app via CDP
2. For each visible component, searches Figma for the matching node
3. Exports and compares both visually
4. Reports specific differences: *"Card border-radius is 8px but Figma says 12px. CTA button color is #3B82F6 but Figma uses #2563EB."*

### 5. Create multiple pages from Figma

> User selects multiple frames in Figma representing different pages, types: *"Create routes for each of these pages"*

The AI:
1. Gets all selected frames via `figma_get_selection`
2. Creates route configuration with one route per frame
3. Generates a page component for each frame, matching the design
4. Wires up navigation between them

### 6. Extract design tokens

> User types: *"Extract the design system from the Figma file and create SCSS variables"*

The AI:
1. Searches for style-related nodes via `figma_search_nodes`
2. Inspects color, typography, and spacing nodes via `figma_get_node`
3. Generates `_variables.scss` with design tokens that match the Figma file

## Files

### New files
- `apps/server/src/services/figma-bridge.service.ts` — WebSocket connection manager (request/response pattern)
- `apps/client/src/app/core/services/figma-bridge.service.ts` — Angular service with signals for bridge state
- `apps/server/src/assets/skills/figma-live/SKILL.md` — AI skill with workflow instructions

### Modified files
- `libs/shared-types/src/lib/shared-types.ts` — Protocol types (`FigmaBridgeMessage`, `FigmaCommand`, `FigmaBridgeEvent`)
- `apps/figma-plugin/src/manifest.json` — Network access for localhost WebSocket
- `apps/figma-plugin/src/code.ts` — Bridge command handlers + selection forwarding
- `apps/figma-plugin/src/ui.html` — WebSocket relay + connection UI
- `apps/server/src/main.ts` — WebSocket upgrade handler for `/ws/figma-bridge`
- `apps/server/src/routes/figma.routes.ts` — Bridge endpoints (token, status, events SSE, grab-selection)
- `apps/server/src/routes/ai.routes.ts` — Pass `figmaLiveConnected` to AI provider
- `apps/server/src/providers/tools.ts` — `FIGMA_TOOLS` array (5 tools)
- `apps/server/src/providers/base.ts` — Tool registration, execution, system prompt injection
- `apps/server/src/providers/types.ts` — `figmaLiveConnected` option
- `apps/client/src/app/features/editor/figma/figma-panel.component.*` — Live bridge UI section

## WebSocket Protocol

### Plugin → Server

| Message | Payload |
|---------|---------|
| `figma:hello` | `{ pluginVersion, fileKey, fileName }` |
| `figma:selection_changed` | `{ selection[], pageId, pageName }` |
| `figma:response` | `{ requestId, data, error? }` |

### Server → Plugin

| Message | Payload |
|---------|---------|
| `figma:auth` | `{ token }` (JWT for reconnect, sent after code-based auth) |
| `figma:request` | `{ requestId, command: FigmaCommand }` |

### Server → Client (SSE on `/api/figma/bridge/events`)

| Event | Payload |
|-------|---------|
| `figma:connected` | `{ fileKey, fileName }` |
| `figma:disconnected` | `{}` |
| `figma:selection_update` | `{ selection[], pageId, pageName }` |

## Limitations & Future Work

- **Desktop-only**: Requires both apps running on the same machine (localhost WebSocket)
- **Single file**: The bridge connects to one Figma file at a time (whichever is open when the plugin starts)
- **No Figma write-back**: The AI can select/scroll but cannot modify Figma nodes (e.g., update colors, resize). This could be added via the plugin API's write capabilities
- **Connection code UX**: Requires manual code entry. Could be improved with auto-discovery (mDNS) or deep links
- **No design token extraction API**: The AI infers tokens from node properties. A dedicated Figma variables/styles API integration could provide structured token data
