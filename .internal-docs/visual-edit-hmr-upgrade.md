# Upgrading Template Annotations to Proper HMR

## Current State (Full Page Reload)

The ong template annotation plugin (`templateAnnotatePlugin`) works by **inlining** external templates:

1. Plugin intercepts the `.ts` file in a Vite `transform` hook (`enforce: 'pre'`)
2. Reads the `.html` template from disk via `readFileSync`
3. Annotates every element with `_ong` attributes
4. Replaces `templateUrl: './app.html'` with `template: \`<annotated html>\``
5. OXC compiles the inlined template normally

**Why HMR breaks:** OXC's HMR pipeline only works for templates it resolves itself via `templateUrl`. Since we replace `templateUrl` with an inline `template:`, OXC never:
- Calls `readFile` on the `.html` file
- Registers it with its custom `fs.watch` handler
- Tracks it in `resourceToComponent` or `pendingHmrUpdates`
- Sends `angular:component-update` WebSocket events for it

**Current workaround:** When the `.html` file changes, our `handleHotUpdate` intercepts it, touches the `.ts` file via `utimesSync`, and returns `[]`. This triggers a full page reload through OXC's `.ts` file change detection — functional but not ideal.

**GitHub issue:** https://github.com/voidzero-dev/oxc-angular-compiler/issues/149

---

## Future Fix: `templateTransform` Hook

When `@oxc-angular/vite` adds a `templateTransform` option (see issue above), the fix is straightforward.

### What Changes in `@oxc-angular/vite`

In `resolveResources()`, after reading the template from disk:

```javascript
content = await readFile(templatePath, 'utf-8');
// NEW: apply template transform
if (pluginOptions.templateTransform) {
  content = pluginOptions.templateTransform(content, templatePath);
}
resourceCache.set(templatePath, content);
```

Same in the HMR recompilation path (where templates are re-read on file change).

### What Changes in ong

**File:** `ong/src/config.ts`

Pass the annotation function as `templateTransform` to OXC's `angular()` plugin:

```typescript
import { annotateTemplateContent } from './template-annotate-plugin.js'

...angular({
  tsconfig: opts.tsconfig,
  sourceMap: opts.sourceMap,
  liveReload: !opts.optimization,
  workspaceRoot,
  // NEW: annotate templates during OXC's resource resolution
  templateTransform: opts.annotateTemplates
    ? (content: string, filePath: string) => annotateTemplateContent(content, filePath, workspaceRoot)
    : undefined,
  ...(opts.fileReplacements.length ? { fileReplacements: opts.fileReplacements } : {}),
  angularVersion: detectAngularVersion(workspaceRoot),
}),
```

**File:** `ong/src/template-annotate-plugin.ts`

The plugin simplifies dramatically — **remove ALL of these:**

- The `transform` hook on `.ts` files (no more inlining)
- The `handleHotUpdate` hook (OXC handles it natively)
- The `configureServer` hook
- The `templateToTsPath` and `tsPathToClassName` maps
- The `utimesSync` touch workaround

**Keep only:**

- `transformIndexHtml` — to inject `window.__ong_annotations = {}` bootstrapper
- A **new exported function** `annotateTemplateContent(html, filePath, workspaceRoot)` that:
  - Parses the HTML
  - Adds `_ong` attributes
  - Collects annotation entries
  - Returns the annotated HTML

The annotation registrations (`window.__ong_annotations[N] = {...}`) need to move too. Since the template is no longer inlined in the `.ts` file, we can't append the registration code there. Options:
1. Inject registrations via `transformIndexHtml` (batch all at startup)
2. Or use a separate Vite plugin that appends registrations to the compiled `.ts` output in a post-transform

**File:** `ong/src/template-annotate-plugin.ts` — simplified version:

```typescript
export function annotateTemplateContent(
  html: string,
  filePath: string,
  workspaceRoot: string,
): string {
  // Parse, annotate, return — same logic as today's annotateTemplate()
  // but exported as a standalone function for use as templateTransform callback
}

export function templateAnnotatePlugin(): Plugin {
  return {
    name: 'ong:template-annotate',

    transformIndexHtml: {
      order: 'post',
      handler() {
        return [{
          tag: 'script',
          attrs: { type: 'text/javascript' },
          children: `window.__ong_annotations = window.__ong_annotations || {};`,
          injectTo: 'head',
        }]
      },
    },

    // Append annotation registrations to compiled .ts output
    transform: {
      order: 'post',  // Run AFTER OXC compilation
      filter: { id: /\.tsx?$/ },
      handler(code, id) {
        // Check if this component has annotations from templateTransform
        // and append the registration side-effect
      },
    },
  }
}
```

### What Changes in Adorable

**Nothing.** The Adorable integration (local-agent, NativeContainerEngine, project-detect) stays exactly the same. It passes `--annotate-templates` and `--inject-html-file` to ong. The only difference is that template edits trigger proper Angular HMR instead of a full page reload.

### How to Test the Upgrade

1. Update `@oxc-angular/vite` to the version with `templateTransform`
2. Update `ong/src/config.ts` to pass the transform callback
3. Simplify `ong/src/template-annotate-plugin.ts` as described above
4. Run `ong serve --annotate-templates` on a test project
5. Edit a template file → should see `angular:component-update` WebSocket event (not `full-reload`)
6. The component updates in-place without losing state
7. Verify annotations are still present in the DOM after HMR

### What to Watch For

- The `resourceCache` in OXC's plugin caches template content. Make sure `templateTransform` runs both on initial load AND on HMR re-reads (when the cache is invalidated after file change)
- The annotation IDs (`nextId` counter) need to be deterministic or resettable — otherwise IDs change on every HMR update, breaking the `window.__ong_annotations` lookup
- The `_ong` attributes in the DOM must match the IDs in `__ong_annotations` after HMR — verify by clicking elements in the visual editor after a template edit
