# Visual Editing Next: Template Annotations via ong Vite Plugin

## Problem

The current visual editing system relies on the AI adding `data-elements-id` attributes to every HTML element via system prompt instructions. This has several issues:
- **External projects** (opened via "Open Folder") don't have these attributes at all
- **AI compliance is inconsistent** — the AI sometimes uses dynamic bindings instead of static values, or forgets IDs entirely
- **TemplateService matching** falls back to weak heuristics (text/class matching) when IDs are missing or malformed
- **Two concerns are coupled** — the AI has to think about visual editing metadata while generating application code

## Solution (Implemented in ong)

Use **ong** (our drop-in `ng` replacement built on Vite + OXC) to annotate every HTML element at compile time with a short numeric `_ong` attribute. Rich metadata (file, line, col, component info, bindings, text type) is stored in `window.__ong_annotations` — a global lookup table.

```html
<!-- What's on disk (untouched): -->
<h3>Hello World</h3>

<!-- What appears in the DOM (compile-time injection): -->
<h3 _ong="42">Hello World</h3>
```

```javascript
// window.__ong_annotations[42]:
{
  file: "src/app/features/header/header.html",
  line: 3, col: 2,
  tag: "h3",
  component: "HeaderComponent",
  selector: "app-header",
  tsFile: "src/app/features/header/header.ts",
  parent: 38,
  inLoop: false,
  conditional: false,
  text: { hasText: true, type: "static", content: "Hello World" },
  bindings: { inputs: {}, outputs: {}, twoWay: {}, structural: [] }
}
```

### What's Implemented (ong repo)

The `templateAnnotatePlugin` Vite plugin is complete and tested. It:

- **Intercepts `.ts` files** (not `.html`) before the OXC compiler, because OXC reads templates directly from disk — not through Vite's module graph
- **Handles external templates** (`templateUrl: './app.html'`) — reads the HTML file, annotates it, replaces `templateUrl` with an inline `template:` containing the annotated HTML
- **Handles inline templates** (`template: \`...\``) — annotates the template string in place, with correct line offsets
- **Works with any naming convention** — `app.html`, `header.component.html`, etc. (Angular 19+ dropped the `.component` suffix)
- **Uses workspace-relative paths** — not absolute paths, for portability
- **Enabled via env var** — `ADORABLE_ANNOTATE_TEMPLATES=true`
- **Extracts rich metadata** per element:
  - `file`, `line`, `col` — exact source location
  - `tag` — HTML tag name
  - `component`, `selector`, `tsFile` — owning Angular component
  - `parent` — annotation ID of parent element (enables tree navigation)
  - `inLoop`, `conditional` — whether inside `@for` / `@if` blocks
  - `text.type` — `'static'` | `'interpolated'` | `'mixed'` | `'none'` (tells the visual editor if text can be directly edited or requires changing a binding expression)
  - `text.content` — the raw text / expression
  - `bindings` — `inputs` (`[prop]="expr"`), `outputs` (`(event)="handler()"`), `twoWay` (`[(ngModel)]`), `structural` (`*ngIf`, etc.)

### ong Files Changed

| File | Change |
|------|--------|
| `src/template-annotate-plugin.ts` | **New** — Vite plugin with rich metadata extraction |
| `src/config.ts` | Wire plugin into `createViteConfig()` behind `annotateTemplates` flag |
| `src/workspace.ts` | Add `annotateTemplates` to `ResolvedBuildOptions`, read from env var |
| `src/index.ts` | Export `templateAnnotatePlugin` in public API |
| `package.json` | Add `angular-html-parser` dependency |

---

## Rollout Scope (Phase 1 — Current)

**Desktop only, external projects only.** This is the safest rollout:

- External projects (opened via "Open Folder") use `ong serve` with template annotation
- Standard Adorable projects continue using `ng serve` + AI-generated `data-elements-id` — unchanged
- Cloud/web mode is completely untouched
- The AI system prompt keeps the `data-elements-id` instruction for standard projects but skips it for external projects

## Adorable Integration (TODO)

### Use ong for External Projects

**File:** `apps/server/src/services/project-detect.service.ts`

Set the dev/build commands to ong for external projects:
```typescript
config.commands.dev = { cmd: 'npx', args: ['@richapps/ong', 'serve'] };
config.commands.build = { cmd: 'npx', args: ['@richapps/ong', 'build'] };
config.devServerPreset = 'ong';
```

### Enable Annotation for External Projects

**File:** `apps/desktop/local-agent.ts`

Add `isExternalProject` flag to NativeManager. Set `ADORABLE_ANNOTATE_TEMPLATES=true` in the env for exec/execStream when external:

```typescript
if (this.isExternalProject) {
  mergedEnv['ADORABLE_ANNOTATE_TEMPLATES'] = 'true';
}
```

### TemplateService: Use Annotation Metadata

**File:** `apps/client/src/app/features/editor/services/template.ts`

When the runtime script reads `_ong` from a clicked element, look up `window.__ong_annotations[id]` to get the full metadata. The `file` and `line`/`col` fields give the TemplateService an exact source location — no fuzzy matching needed.

Update `findAndModify()`:
```typescript
if (fingerprint.ongAnnotation) {
  const { file, line, col } = fingerprint.ongAnnotation;
  return this.modifyBySourceLocation(file, line, col, fingerprint, modification);
}
```

The `text.type` field enables the visual editor property panel to show:
- **Static text** → editable text field, modification writes directly to template
- **Interpolated** → shows the expression, modification needs to change component class or expression
- **Mixed** → shows both, warns the user about the dynamic parts

### Runtime Script: Read `_ong` Instead of `data-elements-id`

**File:** `libs/shared-types/src/lib/runtime-scripts.ts` (or the injecting proxy's runtime script)

Update the inspector click handler to read `_ong` and look up `window.__ong_annotations`:
```javascript
const ongId = target.getAttribute('_ong');
if (ongId && window.__ong_annotations) {
  const annotation = window.__ong_annotations[ongId];
  // Send full annotation data to parent
  payload.ongAnnotation = annotation;
}
```

### AI System Prompt — Conditional

**File:** `apps/server/src/providers/base.ts`

Skip the `data-elements-id` instruction for external projects (ong handles it):
```typescript
if (!options.skipVisualEditingIds) {
  prompt += VISUAL_EDITING_IDS_INSTRUCTION;
}
```

---

## Future Phases

### Phase 2 — Design Mode Toggle (all desktop projects)
- Add a "Design Mode" button (like Lovable) that hot-swaps from `ng serve` to `ong serve`
- Normal dev uses `ng serve` (stable), visual editing uses `ong serve` (with annotations)
- User explicitly opts in per session

### Phase 3 — ong as Default for All Projects
- All desktop projects use `ong serve` by default
- Cloud/Docker mode uses ong
- Remove AI-generated `data-elements-id` from system prompt entirely

### Future: DevTools Extension
The `window.__ong_annotations` infrastructure could power a standalone Chrome DevTools extension:
- Element panel with component info, template source, bindings
- Component tree built from parent IDs
- Performance overlay with render counts per element
- See `.internal-docs/ong-opportunities.md` for full list

---

## Verification

1. **ong standalone test (done):**
   - `ADORABLE_ANNOTATE_TEMPLATES=true ong serve` on recordit project
   - All elements have `_ong="N"` attributes
   - `window.__ong_annotations` has rich metadata with correct file paths, line numbers, text types, and bindings

2. **Adorable integration (TODO):**
   - Open external project via "Open Folder" on desktop
   - Dev server starts with ong + annotations
   - Inspector reads `_ong` → looks up annotation → visual editor gets full metadata
   - Modify text/style → TemplateService uses file:line:col for exact source modification
   - `text.type` controls whether text edit modifies template or component class

3. **Regression:**
   - Standard Adorable projects → `ng serve`, AI-generated IDs, unchanged
   - Cloud/web mode → completely unaffected
