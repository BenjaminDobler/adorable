# Opportunities Enabled by ong in Adorable

## Context

ong is our drop-in replacement for `ng serve` / `ng build`, built on Vite + OXC (Rust-based Angular compiler). Because we own both ong and Adorable, we have full control over the Vite plugin pipeline — something Angular CLI never exposes. This unlocks capabilities that are impossible with the standard Angular toolchain.

This document explores features that become possible when projects are served through ong.

---

## 1. AI-Aware Error Overlay

### What
When ong hits a compilation error (template syntax, TypeScript, style), instead of just showing a Vite error overlay in the browser, forward the full error context — file path, line number, error message, surrounding code — directly into the Adorable chat. The AI can then automatically fix the issue without the user needing to copy-paste error messages.

### How
A custom Vite plugin listens for compilation errors via the `buildStart` / `transform` error hooks. On error, it sends a structured payload to the local agent via HTTP:

```typescript
{
  type: 'compilation-error',
  file: '/path/to/component.ts',
  line: 42,
  column: 8,
  message: "Property 'title' does not exist on type 'AppComponent'",
  code: '  <h1>{{ title }}</h1>',  // surrounding lines
  severity: 'error'
}
```

The local agent relays this to the renderer via IPC, which injects it into the chat as a system message. The AI sees the exact error with source location and can fix it in one shot.

### Why It Matters
Today the user sees a white screen or broken preview, has to open DevTools or read terminal output, copy the error, and paste it into the chat. This closes that loop automatically — build fails → AI fixes → preview recovers, all without user intervention.

---

## 2. Component Dependency Graph

### What
At build time, ong can extract the full component dependency graph: which components import which, what services they inject, which templates reference which child components. This graph is available to the AI as context before making changes.

### How
OXC already extracts component metadata via `extractComponentMetadata()` — selector, imports, template/style URLs. A Vite plugin collects this for every component during the initial build:

```typescript
// Collected at build time:
{
  "app-header": {
    file: "src/app/header/header.component.ts",
    selector: "app-header",
    imports: ["CommonModule", "RouterModule", "LogoComponent"],
    templateUrl: "./header.component.html",
    usedIn: ["app.component.html"]  // reverse lookup
  }
}
```

This graph is served via a local agent endpoint (`GET /api/native/component-graph`) and included in the AI's context when generating code.

### Why It Matters
When the AI needs to modify a component, it currently has no understanding of how components relate. It might edit a shared component without realizing it affects 10 other views, or create a duplicate instead of reusing an existing component. The dependency graph gives it structural awareness.

---

## 3. Hot-Inject New Components (Zero-Restart HMR)

### What
When the AI creates a new component, it appears in the preview instantly without restarting the dev server. Today, creating a new `.component.ts` file requires a full rebuild because Angular's compiler needs to discover and register it. With ong, we can dynamically register new components during HMR.

### How
OXC's `compileForHmr()` API can compile a single component in isolation and generate an HMR update module. A Vite plugin watches for new files and:

1. Compiles the new component via OXC
2. Generates an HMR module that registers it with Angular's runtime
3. Pushes the update via Vite's HMR channel

The parent component's template (which references the new component via its selector) is also recompiled via HMR.

### Why It Matters
Currently, after the AI creates a new component, the user has to wait for a full rebuild (several seconds). With hot-injection, the new component appears in under 100ms. This makes the AI coding loop feel instant — generate → see it → iterate.

---

## 4. Live Component Usage Analytics

### What
Instrument templates at compile time to track which components render, how often, with what inputs, and how long they take. This data helps the AI understand the app's runtime behavior — not just its source code.

### How
A Vite plugin wraps each component's template function with a lightweight profiling wrapper:

```typescript
// Before:
function AppComponent_Template(rf, ctx) { ... }

// After (dev mode only):
function AppComponent_Template(rf, ctx) {
  __adorable_track('AppComponent', rf, ctx);
  // ... original template code ...
}
```

The `__adorable_track` function (injected via the runtime scripts) records render counts, input values, and timing. Data is available via `GET /api/native/component-analytics`.

### Why It Matters
When the user says "the page is slow" or "this component re-renders too many times," the AI can look at actual runtime data instead of guessing. It can identify performance bottlenecks, unnecessary re-renders, and unused components.

---

## 5. Template Diffing for AI Verification

### What
After the AI edits a template, compare the before/after compiled output at the Angular IR level — not just text diffs. This catches semantic changes the AI might not have intended: accidentally removed event handlers, broken bindings, changed component inputs.

### How
Before the AI edit, capture the compiled template output (from OXC's `compileTemplate()`). After the edit, compile again and diff the Angular IR:

```
BEFORE: ɵɵelement(0, "button")  ɵɵlistener("click", function() { return ctx.onClick(); })
AFTER:  ɵɵelement(0, "button")  // listener removed!
```

Differences are reported as structured warnings:
```typescript
{
  type: 'semantic-diff',
  component: 'AppComponent',
  changes: [
    { kind: 'listener-removed', element: 'button', event: 'click' },
    { kind: 'binding-added', element: 'div', property: 'class.active' }
  ]
}
```

### Why It Matters
The AI sometimes makes unintended changes — removing a click handler while editing text, or breaking a binding while changing styles. Semantic diffing catches these before the user notices, allowing the AI to self-correct or warn the user.

---

## 6. Style Isolation Preview Toggle

### What
Let users toggle Angular's view encapsulation on/off per component in real time, without rebuilding. This helps understand how styles cascade — useful when debugging CSS issues or when the AI needs to understand why a style doesn't apply.

### How
OXC's `encapsulateStyle()` function adds `[ng-cXXX]` attribute selectors to CSS rules for `ViewEncapsulation.Emulated`. A Vite plugin can:

1. Maintain both encapsulated and un-encapsulated versions of each component's styles
2. On toggle, push the alternate version via HMR
3. Toggle the `ng-cXXX` host attributes on/off on the component's DOM element

### Why It Matters
Style encapsulation issues are one of the most common problems in Angular apps. "Why doesn't my style apply?" is often because of encapsulation. Being able to toggle it live makes debugging instant.

---

## 7. Instant Build Validation

### What
Before the AI writes files to disk, pre-validate them through OXC's compiler to catch errors without triggering a full rebuild. The AI can check if its code compiles before committing the changes.

### How
Use OXC's standalone `compileTemplate()` and `transformAngularFile()` APIs (available via `@oxc-angular/vite`) to compile a single file in isolation:

```typescript
import { compileTemplate, transformAngularFile } from '@oxc-angular/vite';

// Validate before writing:
const result = await compileTemplate(newTemplateHtml, 'MyComponent', filePath);
if (result.errors.length > 0) {
  // Don't write — report errors to AI for correction
}
```

This runs in milliseconds (Rust compiler) and catches template syntax errors, unknown properties, missing imports, etc.

### Why It Matters
Today the AI writes files → build fails → user sees error → AI reads error → AI fixes. With pre-validation, the AI catches its own mistakes before they reach the build, reducing round-trips and improving the user experience.

---

## 8. Incremental Template Extraction for AI Context

### What
Instead of sending entire files to the AI as context, extract only the relevant template fragments. OXC can parse templates into an AST and extract specific sections (e.g., "the header section" or "the form with class .login-form"), reducing token usage and improving AI focus.

### How
Use `angular-html-parser` (same as the template annotate plugin) to parse templates and extract subtrees by selector, class, or structural pattern. Combine with the component dependency graph (#2) to build a focused context window:

```
User: "Change the login button color"
→ Component graph: LoginComponent
→ Template extraction: only the <button> section of login.component.html
→ Style extraction: only the .login-btn rules
→ AI receives 50 tokens of context instead of 500
```

### Why It Matters
Token efficiency directly affects response speed and cost. Focused context also means the AI is less likely to make unrelated changes to other parts of the template.

---

## Priority Matrix

| Feature | Impact | Effort | Risk | Priority |
|---------|--------|--------|------|----------|
| Template Annotation (visual edit) | High | Low | Low | **Now** |
| AI-Aware Error Overlay | High | Low | Low | **Next** |
| Instant Build Validation | High | Medium | Low | **Next** |
| Component Dependency Graph | Medium | Medium | Low | Soon |
| Hot-Inject New Components | High | High | Medium | Later |
| Template Diffing | Medium | High | Medium | Later |
| Live Usage Analytics | Medium | High | Medium | Later |
| Style Isolation Toggle | Low | Medium | Low | Later |
| Incremental Template Extraction | Medium | Medium | Low | Later |

---

## Common Infrastructure

Several features share the same infrastructure. Building these once enables multiple features:

1. **Local agent ↔ Vite plugin communication channel** — A simple HTTP or WebSocket bridge between Vite plugins (running inside ong) and the local agent (port 3334). Needed for: error overlay, analytics, component graph.

2. **OXC standalone compilation API** — Calling `compileTemplate()` / `transformAngularFile()` outside of the Vite build pipeline. Needed for: build validation, template diffing.

3. **Component metadata registry** — A runtime data structure that maps selectors → file paths → compiled output. Needed for: dependency graph, hot-injection, analytics.
