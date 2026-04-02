# Figma-to-Implementation Comparison Overlay

A tool that visually highlights differences between the live Angular preview and the original Figma design — so you can instantly see if your implementation matches the design.

## Motivation

Currently there's no automated way to verify that generated/hand-written code matches the Figma design specs. Developers have to eyeball it or manually compare values. This feature closes that loop.

**Prerequisite:** Builds on top of the measurement tool (already shipped) and the existing Figma integration.

## Core Concept

When a project has a connected Figma file (via import or Live Bridge), the measurement overlay can show **comparison data** — green for matching, red/yellow for deviations, with exact delta values.

## Key Technical Approach

### 1. DOM-to-Figma Node Mapping via `data-figma-node` Attributes

- During AI generation from Figma imports, have the AI write `data-figma-node="<nodeId>"` attributes onto generated elements
- Combined with ONG annotations (`_ong` attribute from compile-time Vite plugin), this gives a 1:1 mapping between DOM elements and Figma design nodes
- The Figma `jsonStructure` (already stored in `project.figmaImports`) contains `absoluteBoundingBox`, fills, strokes, cornerRadius, and full hierarchy for every node

### 2. Comparison Overlay Shows

- Per-element: green = matches (within +/-2px tolerance), red/yellow = deviation
- Per-property deltas: e.g., "padding-left: 16px → design: 24px, **-8px**"
- Properties to compare: width, height, padding (all 4), margin, gap, font-size, border-radius, colors
- Summary badge: "3/12 properties differ"

### 3. Live Bridge Sync (the killer feature)

- With Figma Live Bridge connected, the comparison is always against the **latest** Figma state
- When a designer updates the Figma file, the comparison overlay updates in real-time
- The AI can be triggered to auto-fix deviations: "Sync these 3 elements to match updated Figma specs"
- ONG annotations make this targeted — the AI knows exactly which source file/line to update

## Existing Infrastructure to Leverage

- **`project.figmaImports`** (Prisma) — stores `FigmaImportPayload[]` with `jsonStructure` containing `absoluteBoundingBox` for every node
- **Figma Live Bridge** (`figma-bridge.service.ts`) — SSE connection, `grabSelection()`, `figma_get_node` for fresh data
- **ONG annotations** — compile-time source mapping on DOM elements (`_ong` attr → `__ong_annotations` map)
- **Runtime scripts inspector** — already captures computed styles (margin, padding, dimensions, flex/grid props)
- **AI tools** — `FIGMA_TOOLS` in `providers/tools.ts` already let AI inspect Figma nodes during generation

## Synergy with ONG Annotations

ONG annotations provide `{ file, line, column, component }` for each DOM element. Combined with `data-figma-node`:

- **Element → Source file** (via ONG)
- **Element → Figma node** (via data-figma-node)
- **Figma node → Design specs** (via jsonStructure)

This triangle enables: "This button's padding differs from Figma by 8px → here's the exact SCSS line to fix → AI can auto-fix it."

## Implementation Order

1. Extend AI system prompt / generation skills to emit `data-figma-node` attributes when generating from Figma imports
2. Add a comparison data resolver: given a DOM element with `data-figma-node`, look up the Figma node data and compute deltas
3. Extend the measurement overlay to show comparison colors/labels when Figma data is available
4. Add Live Bridge integration: subscribe to Figma changes → re-compare → optionally trigger AI fixes
