# Figma Node URL Import

**Date:** 2026-03-30
**Status:** Approved

## Problem

When a user pastes a Figma URL containing a `node-id` query parameter into the Figma panel, the current flow ignores the node-id and loads the entire file tree, requiring the user to manually find and select the node they already identified. This is unnecessary friction.

## Goal

When a Figma URL has a `node-id`, the panel should detect it, fetch just that node, show a compact "import this node?" card, and — on confirmation — store the result identically to how plugin-exported payloads are stored (persisted with the project, available on re-open).

## Scope

- Changes confined to `FigmaPanelComponent` (client only)
- One small addition to `FigmaImportPayload` in `shared-types`
- No server changes

---

## URL Parsing

In `FigmaPanelComponent.loadFile()`, extract the node-id from the URL before calling the server:

```ts
const nodeIdMatch = url.match(/[?&]node-id=([^&]+)/);
const nodeId = nodeIdMatch ? nodeIdMatch[1].replace(/-/g, ':') : null;
```

Figma URLs encode node IDs with `-` (e.g. `271-7490`); the API expects `:` (e.g. `271:7490`). This conversion happens client-side after extraction.

`figmaService.parseUrl(url)` still runs unchanged to get the `fileKey`.

---

## New View: `'node-preview'`

The `view` computed signal gets a new state: `'node-preview'`.

**Transition into `'node-preview'`:**
After `parseUrl` succeeds and `nodeId` is non-null, call `GET /api/figma/files/:fileKey/nodes?ids=<nodeId>` to fetch that node's metadata. Set a new signal `pendingNode` with `{ fileKey, nodeId, name, type }` and set `pendingNodeLoading` to `true` while the import call is in-flight.

**View logic (priority order):**
1. `selectedImportIndex() !== null` → `'imports'`
2. Not configured + no stored imports → `'setup'`
3. `pendingNode() !== null` → `'node-preview'`
4. No current file → `'input'`
5. Otherwise → `'tree'`

---

## `'node-preview'` UI

A compact card replacing the tree view, shown while importing and after node metadata is fetched:

```
┌─────────────────────────────────────┐
│  [Figma logo]  Frame detected       │
│  "Survey Card / Frame"  (FRAME)     │
│                                     │
│  [thumbnail or spinner]             │
│                                     │
│  [Import to Chat]  [Show all frames]│
└─────────────────────────────────────┘
```

- **Import to Chat**: calls `POST /api/figma/import` with `fileKey` + `[nodeId]`, gets back a `FigmaImportPayload`, calls `storePayload()` (same method as today) → transitions to `'imports'`
- **Show all frames**: clears `pendingNode`, calls `figmaService.getFile(fileKey)` → transitions to `'tree'` as today
- **Error state**: inline error message + "Load full file instead" link that falls back to `'tree'`

---

## Duplicate Detection

`storePayload()` currently deduplicates by `fileKey + JSON.stringify(selection)`. Since single-node imports produce a `selection` of one item, the existing logic handles duplicates correctly — no changes needed.

To make duplicate detection more precise for node-URL imports, `FigmaImportPayload` gets one optional field added to `shared-types`:

```ts
export interface FigmaImportPayload {
  fileKey: string;
  fileName: string;
  selection: FigmaSelection[];
  jsonStructure: any;
  imageDataUris: string[];
  sourceNodeId?: string;  // set when imported via node-id URL
}
```

This allows future enhancements (e.g. "re-fetch this node") and makes the origin explicit, but is not required for the duplicate check to work.

---

## Persistence

`ProjectService.figmaImports` stores `FigmaImportPayload[]` with the project. Single-node imports go through `storePayload()` → `importsChanged.emit()` → `ProjectService` persists → available on next project open. This is identical to the plugin export path. No new storage logic.

---

## New Signals in `FigmaPanelComponent`

| Signal | Type | Purpose |
|--------|------|---------|
| `pendingNode` | `{ fileKey: string; nodeId: string; name: string; type: string } \| null` | Node detected from URL, awaiting import confirmation |
| `pendingNodeLoading` | `boolean` | True while `POST /api/figma/import` is in-flight for the node-preview |

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Node not found (404) | Inline error: "Node not found in this file" + "Load full file instead" |
| No Figma access / auth error | Existing error handling (shows error string) |
| Invalid URL (no fileKey) | Existing error handling |
| Node has no renderable content | Import succeeds without image; `imageDataUris` is empty; card shows "No preview available" |

---

## Out of Scope

- Chat textarea Figma URL detection (not in this spec)
- Auto-import without confirmation
- Re-fetching / refreshing an existing stored node import
