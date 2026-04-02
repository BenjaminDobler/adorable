# Figma Node URL Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Figma URL with a `node-id` query param is pasted into the Figma panel, skip the full file tree and instead show a compact "import this node?" card that imports and persists the result immediately.

**Architecture:** Client-only change. `loadFile()` in `FigmaPanelComponent` extracts the node-id from the URL, and when present branches into a new `'node-preview'` view state instead of the full tree flow. The import goes through the existing `figmaService.importSelection()` and `storePayload()` methods unchanged, so persistence is automatic.

**Tech Stack:** Angular 21 standalone components, signals, `FigmaService` (existing), `FigmaImportPayload` in `@adorable/shared-types`

---

## File Map

| File | Change |
|------|--------|
| `libs/shared-types/src/lib/shared-types.ts` | Add `sourceNodeId?: string` to `FigmaImportPayload` |
| `apps/client/src/app/features/editor/figma/figma-panel.component.ts` | Add signals, update `view` computed, update `loadFile()`, add `importPendingNode()` and `showFullTree()` methods |
| `apps/client/src/app/features/editor/figma/figma-panel.component.html` | Add `'node-preview'` view block |
| `apps/client/src/app/features/editor/figma/figma-panel.component.scss` | Add styles for the node-preview card |

---

## Task 1: Add `sourceNodeId` to `FigmaImportPayload`

**Files:**
- Modify: `libs/shared-types/src/lib/shared-types.ts:62-68`

- [ ] **Step 1: Edit the interface**

In `libs/shared-types/src/lib/shared-types.ts`, change `FigmaImportPayload` from:

```ts
export interface FigmaImportPayload {
  fileKey: string;
  fileName: string;
  selection: FigmaSelection[];
  jsonStructure: any;
  imageDataUris: string[];
}
```

to:

```ts
export interface FigmaImportPayload {
  fileKey: string;
  fileName: string;
  selection: FigmaSelection[];
  jsonStructure: any;
  imageDataUris: string[];
  sourceNodeId?: string;
}
```

- [ ] **Step 2: Verify build still passes**

```bash
cd /Users/I772038/workspace/benz/adorable && npx nx build client --configuration=development 2>&1 | tail -20
```

Expected: build succeeds (no type errors — the field is optional so no existing code breaks).

- [ ] **Step 3: Commit**

```bash
git add libs/shared-types/src/lib/shared-types.ts
git commit -m "feat(shared-types): add sourceNodeId to FigmaImportPayload"
```

---

## Task 2: Update `FigmaPanelComponent` logic

**Files:**
- Modify: `apps/client/src/app/features/editor/figma/figma-panel.component.ts`

This task adds the signals, updates `view`, updates `loadFile()`, and adds two new methods.

- [ ] **Step 1: Add the two new signals**

At line 39 (after `isDragging = signal(false);`), add:

```ts
// Node-URL import flow
pendingNode = signal<{ fileKey: string; nodeId: string; name: string; type: string } | null>(null);
pendingNodeLoading = signal(false);
```

- [ ] **Step 2: Update the `view` computed signal**

Replace the existing `view` computed (lines 48–59):

```ts
view = computed<'setup' | 'input' | 'tree' | 'imports' | 'node-preview'>(() => {
  if (this.selectedImportIndex() !== null) {
    return 'imports';
  }
  if (!this.figmaService.status().configured && this.importedPayloads().length === 0) {
    return 'setup';
  }
  if (this.pendingNode() !== null) {
    return 'node-preview';
  }
  if (!this.figmaService.currentFile()) {
    return 'input';
  }
  return 'tree';
});
```

- [ ] **Step 3: Replace `loadFile()`**

Replace the existing `loadFile()` method (lines 61–77) with:

```ts
loadFile() {
  const url = this.figmaUrl();
  if (!url) return;

  this.error.set(null);

  // Extract node-id from URL if present (Figma uses "-" separator, API uses ":")
  const nodeIdMatch = url.match(/[?&]node-id=([^&]+)/);
  const nodeId = nodeIdMatch ? nodeIdMatch[1].replace(/-/g, ':') : null;

  this.figmaService.parseUrl(url).subscribe({
    next: ({ fileKey }) => {
      this.currentFileKey.set(fileKey);

      if (nodeId) {
        // Node-URL flow: fetch just this node's metadata
        this.pendingNodeLoading.set(true);
        this.figmaService.getNodes(fileKey, [nodeId]).subscribe({
          next: (result: any) => {
            this.pendingNodeLoading.set(false);
            // Figma nodes response: { nodes: { [nodeId]: { document: { name, type, ... } } } }
            const nodeData = result?.nodes?.[nodeId]?.document;
            this.pendingNode.set({
              fileKey,
              nodeId,
              name: nodeData?.name || nodeId,
              type: nodeData?.type || 'UNKNOWN'
            });
          },
          error: (err) => {
            this.pendingNodeLoading.set(false);
            this.error.set(err.error?.error || 'Node not found in this file');
          }
        });
      } else {
        // Normal flow: load full file tree
        this.figmaService.getFile(fileKey).subscribe({
          error: (err) => this.error.set(err.error?.error || 'Failed to load file')
        });
      }
    },
    error: (err) => this.error.set(err.error?.error || 'Invalid Figma URL')
  });
}
```

- [ ] **Step 4: Add `importPendingNode()` method**

Add this method after `loadFile()`:

```ts
importPendingNode() {
  const node = this.pendingNode();
  if (!node) return;

  this.importing.set(true);
  this.error.set(null);

  this.figmaService.importSelection(node.fileKey, [node.nodeId]).subscribe({
    next: (payload) => {
      this.importing.set(false);
      this.pendingNode.set(null);
      // Tag the payload with its source node ID
      const taggedPayload = { ...payload, sourceNodeId: node.nodeId };
      this.storePayload(taggedPayload);
    },
    error: (err) => {
      this.importing.set(false);
      this.error.set(err.error?.error || 'Failed to import node');
    }
  });
}
```

- [ ] **Step 5: Add `showFullTree()` method**

Add this method after `importPendingNode()`:

```ts
showFullTree() {
  const node = this.pendingNode();
  if (!node) return;
  this.pendingNode.set(null);
  this.error.set(null);
  this.figmaService.getFile(node.fileKey).subscribe({
    error: (err) => this.error.set(err.error?.error || 'Failed to load file')
  });
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/I772038/workspace/benz/adorable && npx nx build client --configuration=development 2>&1 | tail -20
```

Expected: build succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/app/features/editor/figma/figma-panel.component.ts
git commit -m "feat(figma): add node-preview flow to FigmaPanelComponent"
```

---

## Task 3: Add `'node-preview'` view to the template

**Files:**
- Modify: `apps/client/src/app/features/editor/figma/figma-panel.component.html`

- [ ] **Step 1: Add the node-preview block**

In `figma-panel.component.html`, add the following block **after** the closing `}` of the `@if (view() === 'input')` block (after line 178) and **before** the `<!-- Imports Detail View -->` comment:

```html
<!-- Node Preview View - Single node detected from URL -->
@if (view() === 'node-preview') {
  <div class="node-preview-view">
    <div class="tree-header">
      <button class="btn-back" (click)="pendingNode.set(null); error.set(null)">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        Back
      </button>
      <div class="file-name">Frame detected</div>
    </div>

    <div class="node-preview-card">
      <div class="node-preview-icon" [innerHTML]="getNodeIcon(pendingNode()!.type)"></div>
      <div class="node-preview-name">{{ pendingNode()!.name }}</div>
      <div class="node-preview-type">{{ pendingNode()!.type }}</div>

      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }
    </div>

    <div class="node-preview-actions">
      <button
        class="btn-import"
        [disabled]="importing() || pendingNodeLoading()"
        (click)="importPendingNode()"
      >
        @if (importing() || pendingNodeLoading()) {
          Importing...
        } @else {
          Import to Chat
        }
      </button>
      <button class="btn-link" (click)="showFullTree()">
        Show all frames
      </button>
    </div>
  </div>
}
```

- [ ] **Step 2: Verify template compiles**

```bash
cd /Users/I772038/workspace/benz/adorable && npx nx build client --configuration=development 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/app/features/editor/figma/figma-panel.component.html
git commit -m "feat(figma): add node-preview view template"
```

---

## Task 4: Style the node-preview view

**Files:**
- Modify: `apps/client/src/app/features/editor/figma/figma-panel.component.scss`

- [ ] **Step 1: Read existing SCSS to understand the patterns in use**

Read `apps/client/src/app/features/editor/figma/figma-panel.component.scss` to understand the existing class naming and variables before adding styles.

- [ ] **Step 2: Add styles**

Append the following to the end of `figma-panel.component.scss`:

```scss
// Node Preview View
.node-preview-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.node-preview-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  text-align: center;
}

.node-preview-icon {
  font-size: 32px;
  opacity: 0.6;
}

.node-preview-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  word-break: break-word;
}

.node-preview-type {
  font-size: 11px;
  color: var(--text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.node-preview-actions {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));

  .btn-import {
    width: 100%;
  }

  .btn-link {
    text-align: center;
  }
}
```

- [ ] **Step 3: Verify build and check in browser**

```bash
cd /Users/I772038/workspace/benz/adorable && npx nx build client --configuration=development 2>&1 | tail -10
```

Expected: build succeeds. Then open the app, go to the Figma panel, and paste a Figma URL with `?node-id=271-7490` to verify the node-preview view appears with the node name and two buttons.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/app/features/editor/figma/figma-panel.component.scss
git commit -m "feat(figma): style node-preview card"
```

---

## Manual Test Checklist

After all tasks are complete, verify these scenarios work:

1. **Node URL → node-preview**: Paste `https://www.figma.com/design/Gzf5nSGrkfFze0iEsDXPad/...?node-id=271-7490` → should show node-preview card with node name and type (not the full tree)
2. **Import to Chat**: Click "Import to Chat" → spinner → transitions to `'imports'` view showing the imported frame
3. **Show all frames**: Click "Show all frames" → loads normal tree view for the full file
4. **Back button**: Click back from node-preview → returns to `'input'` view
5. **Persistence**: Import a node, reload the project → frame appears in Previous Imports on the `'input'` view
6. **No node-id**: Paste a plain Figma URL without `node-id` → normal tree flow unchanged
7. **Invalid node**: Paste URL with a node-id that doesn't exist in the file → shows "Node not found in this file" error with ability to go back
