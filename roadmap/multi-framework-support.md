# Multi-Framework Support — Framework Builder

## Current State

Adorable generates **Angular 21 apps exclusively**. Angular is deeply embedded across the stack:

- **AI System Prompt** (`base.ts:17`): "You are an expert Angular developer"
- **Knowledge Base** (`knowledge-base.ts`): 56 lines of Angular 21 patterns (signals, standalone components, inject(), @if/@for control flow)
- **Base Project Template** (`base-project.ts`): Hardcoded Angular scaffold (angular.json, @angular/* packages, ng serve/build, bootstrapApplication)
- **Container Engines** (`local-container.engine.ts`, `native-container.engine.ts`): Port 4200, `'Application bundle generation complete'` detection, `pkill ng`
- **Docker Manager** (`docker-manager.ts`): Port 4200 binding, `.angular` in ignore list
- **Protected Files** (`base.ts:560`): `['package.json', 'angular.json', 'tsconfig.json', 'tsconfig.app.json']`
- **Dev Server Nudge** (`base.ts:735-744`): `cp src/main.ts src/main.ts.bak` trick for Angular HMR
- **Template Service** (`template.ts`): Uses `angular-html-parser` for visual editing
- **Project Service** (`project.ts`): `dist/app/browser` publish path, `.angular` cache skip, `migrateProject()` modifies angular.json
- **UI Text**: Greetings say "build an Angular app", kit builder says "Default Angular 21"
- **Skills**: `angular-expert` skill with standalone components, signals, OnPush
- **Kit System** (`kits/types.ts`): `angularVersion` field, `usageType: 'directive' | 'component'`
- **Tool Descriptions** (`tools.ts:153`): delete_file mentions `angular.json`

**What IS already framework-agnostic:**
- File system abstractions (MemoryFileSystem, ContainerFileSystem)
- All file tools (write_file, read_files, edit_file, etc.)
- Agentic loop structure (tool execution, message pruning, build-check loop)
- SSE streaming protocol
- Project persistence (Prisma + disk)
- File explorer, editor, zip export
- MCP integration, Git versioning

---

## Vision: Framework Builder

Instead of hardcoding support for React, Svelte, Vue, etc., we build a **Framework Builder** — a user-facing tool (like the Kit Builder) where users define and customize frameworks. Adorable ships with built-in frameworks (Angular, React, Svelte) but anyone can create or fork them.

This follows the same proven pattern as the Kit Builder:
- **Kit Builder** = "teach the AI about a component library"
- **Framework Builder** = "teach the AI about a framework"

---

## User Flow: Framework Builder

### Creating a Framework

The Framework Builder is a multi-step wizard accessible from Settings or Dashboard:

```
┌─────────────────────────────────────────────────────┐
│  Framework Builder                                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. Basics                                           │
│     ┌─────────────────────────────────┐              │
│     │ Name:     [React (Vite)       ] │              │
│     │ Version:  [19                 ] │              │
│     │ Icon:     [⚛️ ▼               ] │              │
│     └─────────────────────────────────┘              │
│                                                      │
│  2. Template Files                                   │
│     ○ Start from scratch                             │
│     ● Import from folder                             │
│     ○ Clone from existing framework                  │
│     ┌─────────────────────────────────┐              │
│     │ 📁 package.json                 │              │
│     │ 📁 vite.config.ts               │              │
│     │ 📁 tsconfig.json                │              │
│     │ 📁 index.html                   │              │
│     │ 📁 src/                         │              │
│     │   📄 main.tsx                   │              │
│     │   📄 App.tsx                    │              │
│     │   📄 App.css                    │              │
│     └─────────────────────────────────┘              │
│                                                      │
│  3. Knowledge Base                                   │
│     ┌─────────────────────────────────┐              │
│     │ # React 19 Knowledge Base       │              │
│     │                                 │              │
│     │ ## Components                   │              │
│     │ - Use functional components     │              │
│     │ - Props via TypeScript iface    │              │
│     │                                 │              │
│     │ ## State                        │              │
│     │ - useState for local state      │              │
│     │ - useReducer for complex...     │              │
│     └─────────────────────────────────┘              │
│     [✨ Generate with AI]                            │
│                                                      │
│  4. AI Rules                                         │
│     ┌─────────────────────────────────┐              │
│     │ Protected files:                │              │
│     │   [x] package.json              │              │
│     │   [x] vite.config.ts            │              │
│     │   [x] tsconfig.json             │              │
│     │   [ ] + Add file                │              │
│     │                                 │              │
│     │ Root component path:            │              │
│     │   [src/App.tsx               ]  │              │
│     │                                 │              │
│     │ Custom instructions:            │              │
│     │   [Always use hooks, never...] │              │
│     └─────────────────────────────────┘              │
│                                                      │
│  5. Dev Server                                       │
│     ┌─────────────────────────────────┐              │
│     │ Port:          [5173          ] │              │
│     │ Ready pattern: [Local:.*local ] │              │
│     │ Build output:  [dist          ] │              │
│     │ Cache dirs:    [node_modules/  │              │
│     │                 .vite        ] │              │
│     └─────────────────────────────────┘              │
│                                                      │
│  [Cancel]                    [Save Framework]        │
└─────────────────────────────────────────────────────┘
```

### Steps in Detail

**Step 1 — Basics:** Name, version, optional icon/emoji. The name appears in project creation.

**Step 2 — Template Files:** The starter project scaffold. Three options:
- **Import from folder** — Drag a local project folder (same as Kit Builder's custom template import)
- **Clone existing** — Fork a built-in framework and customize it
- **Start from scratch** — Empty file tree, add files manually
- Users can edit files inline, add/remove files, see the tree

**Step 3 — Knowledge Base:** A markdown document that teaches the AI framework patterns and best practices. This is the equivalent of the Kit Builder's component docs — but for the framework itself.
- Freeform markdown editor
- **"Generate with AI" button** — Uses an LLM to generate a knowledge base from the template files and npm package readmes. ("Analyze this project template and write a knowledge base covering the framework's key patterns, conventions, and best practices.")
- ~50-200 lines typically. Covers: component patterns, state management, routing, styling, HTTP, forms, build conventions.

**Step 4 — AI Rules:** Structured configuration for how the AI should behave:
- **Protected files** — Checklist of files the AI shouldn't overwrite (package.json always included)
- **Root component path** — The entry component file
- **Custom instructions** — Freeform text appended to the system prompt (same pattern as Kit Builder's `systemPrompt` field)
- **Base system prompt override** — Advanced: completely replace the core system prompt (same as Kit Builder's `baseSystemPrompt`)

**Step 5 — Dev Server:** Technical configuration for the container engine:
- **Port** — Default dev server port (4200, 5173, 3000, etc.)
- **Ready pattern** — Regex to detect when dev server is ready in stdout
- **Build output path** — Where `npm run build` puts files (for publishing)
- **Cache directories** — Directories to clean/skip

### Using a Framework

When creating a new project on the Dashboard:

```
┌──────────────────────────────────────────┐
│  New Project                              │
│                                           │
│  Select a framework:                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Angular  │ │  React   │ │  Svelte  │  │
│  │  v21  ✓   │ │  v19     │ │  v5      │  │
│  │  Built-in │ │  Built-in│ │  Built-in│  │
│  └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐               │
│  │  Vue      │ │  + New   │               │
│  │  v3       │ │ Framework│               │
│  │  Custom   │ │          │               │
│  └──────────┘ └──────────┘               │
│                                           │
│  Then select a component kit (optional):  │
│  [Shows kits compatible with framework]   │
│                                           │
│  Project name: [My App              ]     │
│  [Create Project]                         │
└──────────────────────────────────────────┘
```

The flow is: **Pick Framework → Pick Kit (optional) → Name → Create**

Kits are filtered to show only those compatible with the selected framework (or framework-agnostic kits).

---

## Data Model: Framework Definition

```typescript
interface FrameworkDefinition {
  id: string;
  name: string;
  version?: string;
  icon?: string;                        // Emoji or icon identifier
  builtIn: boolean;                     // true for Angular/React/Svelte defaults

  // Template
  template: {
    files: WebContainerFiles;           // Starter project scaffold
  };

  // AI Knowledge
  knowledgeBase: string;                // Markdown: framework patterns & best practices
  customInstructions?: string;          // Appended to system prompt (like Kit.systemPrompt)
  baseSystemPrompt?: string;            // Override entire system prompt (like Kit.baseSystemPrompt)

  // AI Rules
  protectedFiles: string[];             // Files AI shouldn't overwrite
  rootComponentPath?: string;           // e.g. "src/App.tsx" or "src/app/app.component.ts"

  // Dev Server
  devServer: {
    port: number;                       // Default port (4200, 5173, 3000, etc.)
    readyPattern: string;               // Regex string to detect server ready
    buildOutputPath: string;            // Where production build lands
    cacheDirectories: string[];         // Dirs to skip/clean
    nudgeCommand?: string;              // Optional: poke HMR when it stalls
  };

  // Metadata
  createdAt: string;
  updatedAt: string;
}
```

**Storage:** In `User.settings` JSON alongside kits and profiles (same pattern as Kit storage).

**Built-in frameworks** ship as default entries (like `DEFAULT_KIT` for Angular). Users can clone and customize them but not delete the originals.

---

## How It Flows Into the AI Pipeline

The framework feeds into the AI generation pipeline at the same points where Angular is currently hardcoded, using the same composition pattern as kits:

### System Prompt Composition

```
┌─────────────────────────────────────────────────┐
│  SYSTEM PROMPT (composed at generation time)     │
│                                                  │
│  1. Shared Core (always present)                 │
│     - Tool usage rules                           │
│     - Output format (explanation tags)            │
│     - Conciseness & efficiency rules             │
│     - data-elements-id for visual editing        │
│     - File operation rules                       │
│                                                  │
│  2. Framework Rules (from FrameworkDefinition)    │
│     - "You are an expert {name} developer"       │
│     - Protected files list                       │
│     - Root component convention                  │
│     - Custom instructions                        │
│     OR baseSystemPrompt replaces 1+2 entirely    │
│                                                  │
│  3. Kit Instructions (if kit active)             │
│     - Component catalog                          │
│     - "Read docs before coding" mandate          │
│     - Kit-specific custom instructions           │
├─────────────────────────────────────────────────┤
│  KNOWLEDGE BASE (cached in system context)       │
│     - Framework knowledge (from definition)      │
│     - ~50-200 lines of patterns & conventions    │
├─────────────────────────────────────────────────┤
│  USER MESSAGE                                    │
│     - Component catalog (if kit)                 │
│     - User prompt                                │
│     - Attached images / Figma context            │
└─────────────────────────────────────────────────┘
```

### Generation Pipeline Changes

| Current (hardcoded) | New (framework-driven) |
|---------------------|----------------------|
| `SYSTEM_PROMPT` constant with "Angular developer" | `sharedCore + framework.customInstructions` (or `framework.baseSystemPrompt`) |
| `ANGULAR_KNOWLEDGE_BASE` constant | `framework.knowledgeBase` |
| `protectedFiles = ['angular.json', ...]` | `['package.json', 'tsconfig.json', ...framework.protectedFiles]` |
| `cp src/main.ts src/main.ts.bak` nudge | `framework.devServer.nudgeCommand` or null |
| Hardcoded port 4200 | `framework.devServer.port` |
| `'Application bundle generation complete'` | `new RegExp(framework.devServer.readyPattern)` |
| `dist/app/browser` publish path | `framework.devServer.buildOutputPath` |
| `['.angular']` cache dirs | `framework.devServer.cacheDirectories` |

### Where Framework is Resolved

```
Project creation:
  User picks framework → stored on Project record (DB + disk)

Generation request:
  Client reads project.framework → sends in API body
  Server loads FrameworkDefinition from user settings by ID
  BaseLLMProvider.prepareAgentContext() composes prompt from framework config

Container startup:
  Client reads project.framework → loads framework config
  Uses port, readyPattern, cacheDirectories for dev server management
```

---

## Framework + Kit Composition

Frameworks and Kits are **orthogonal** and compose naturally:

| | Framework | Kit |
|---|-----------|-----|
| **Teaches AI about...** | The language/meta-framework (React hooks, Svelte runes) | A component library (Material UI, PrimeNG) |
| **Provides...** | Starter template, knowledge base, dev server config | Component catalog, docs, design tokens |
| **Modifies system prompt** | Yes (core rules + knowledge base) | Yes (appended instructions + "read docs" mandate) |
| **Scoped to** | Project (set once at creation) | Project (can be changed) |
| **Compatible with** | Any kit tagged for that framework | Any framework (if tagged) |

A user might choose:
- Framework: **React (Vite)** + Kit: **Material UI**
- Framework: **Angular 21** + Kit: **SAP Fundamental**
- Framework: **Svelte (SvelteKit)** + Kit: *none*
- Framework: **Vue 3 (custom)** + Kit: **Vuetify (custom kit)**

Kits gain a `frameworkId` or `compatibleFrameworks` field so the UI can filter appropriately.

---

## Built-in Frameworks (Ship with Adorable)

### Angular 21 (current behavior, extracted into framework definition)

| Field | Value |
|-------|-------|
| Template | Current `BASE_FILES` from `base-project.ts` |
| Knowledge Base | Current `ANGULAR_KNOWLEDGE_BASE` from `knowledge-base.ts` |
| Protected Files | `angular.json`, `tsconfig.app.json` |
| Root Component | `src/app/app.component.ts` |
| Port | 4200 |
| Ready Pattern | `Application bundle generation complete` |
| Build Output | `dist/app/browser` |
| Cache Dirs | `.angular` |
| Nudge Command | `cp src/main.ts src/main.ts.bak && ...` |

### React 19 (Vite + TypeScript)

| Field | Value |
|-------|-------|
| Template | Vite + React + TS scaffold (react, react-dom, @vitejs/plugin-react) |
| Knowledge Base | Hooks, functional components, React Router v6, CSS Modules, Vite conventions |
| Protected Files | `vite.config.ts` |
| Root Component | `src/App.tsx` |
| Port | 5173 |
| Ready Pattern | `Local:\s+https?://localhost:\d+` |
| Build Output | `dist` |
| Cache Dirs | `node_modules/.vite` |
| Nudge Command | *none* (Vite HMR is fast) |

### Svelte 5 (SvelteKit)

| Field | Value |
|-------|-------|
| Template | SvelteKit + adapter-static + TS scaffold |
| Knowledge Base | Runes ($state, $derived, $effect), file-based routing, scoped styles, load functions |
| Protected Files | `vite.config.ts`, `svelte.config.js` |
| Root Component | `src/routes/+page.svelte` |
| Port | 5173 |
| Ready Pattern | `Local:\s+https?://localhost:\d+` |
| Build Output | `build` |
| Cache Dirs | `node_modules/.vite`, `.svelte-kit` |
| Nudge Command | *none* |

### Knowledge Base Content Comparison

| Topic | Angular 21 | React 19 | Svelte 5 |
|-------|-----------|----------|----------|
| Components | Standalone @Component, standalone: true | Functional + JSX, TypeScript props | .svelte files, script + markup + style |
| State | signal(), computed(), effect() | useState, useMemo, useCallback | $state, $derived, $effect (runes) |
| Routing | @angular/router, loadComponent | React Router v6, Outlet, useNavigate | SvelteKit file routing (+page, +layout) |
| Styling | SCSS, component styleUrls | CSS Modules (.module.css) | Scoped `<style>` blocks |
| DI/Context | inject() from @angular/core | useContext, custom hooks | getContext/setContext |
| Forms | FormsModule, ngModel, ReactiveFormsModule | Controlled inputs, onChange | bind:value, bind:checked |
| HTTP | HttpClient + toSignal() | fetch + useEffect, or React Query | fetch in +page.ts load functions |
| Build Tool | Angular CLI (ng build) | Vite (vite build) | Vite + SvelteKit (vite build) |

---

## What Needs to Change — By Area

### 1. Data Model

| Change | File | Detail |
|--------|------|--------|
| Add `framework` to Project | `prisma/schema.prisma` | `framework String @default("angular")` — stores the framework definition ID |
| Add `ProjectFramework` type | `libs/shared-types/src/...` | String type (not enum — user-defined frameworks have custom IDs) |
| Store framework definitions | `User.settings` JSON | `frameworks: FrameworkDefinition[]` alongside `kits`, `profiles` |
| Thread through API | `ai.routes.ts`, `project.routes.ts` | Accept/persist/return `framework` |
| Add to GenerateOptions | `providers/types.ts` | `framework?: FrameworkDefinition` (resolved before generation) |
| Add to client API call | `api.ts`, `chat.component.ts` | Pass `frameworkId` in generate request |
| Add to project service | `project.ts` | `frameworkId` signal, loaded from project |

### 2. AI System Prompt & Knowledge Base

| Change | File | Detail |
|--------|------|--------|
| Split system prompt | `base.ts` | Extract shared core (tool rules, formatting, data-elements-id) from framework-specific section |
| Compose from framework definition | `base.ts` prepareAgentContext | `sharedCore + framework.customInstructions` for system prompt, `framework.knowledgeBase` for knowledge base |
| Parameterize protected files | `base.ts:560` | `['package.json', 'tsconfig.json', ...framework.protectedFiles]` |
| Parameterize dev server nudge | `base.ts:735-744` | `framework.devServer.nudgeCommand` |
| Update delete_file description | `tools.ts:153` | Generic: "Cannot delete critical config files" |

### 3. Container & Dev Server Handling

| Change | File | Detail |
|--------|------|--------|
| Dynamic port binding | `docker-manager.ts:120` | Read port from framework definition, bind it |
| Add cache dirs to ignore | `docker-manager.ts:205` | Merge framework's cache dirs with defaults |
| Framework-aware build detection | `local-container.engine.ts:244` | Use `new RegExp(framework.devServer.readyPattern)` |
| Framework-aware stop/cleanup | `local-container.engine.ts:269-276` | Free the correct port |
| Framework-aware fallback URL | `native-container.engine.ts:279` | Use `framework.devServer.port` |
| Framework-aware publish path | `project.ts:277-290` | Use `framework.devServer.buildOutputPath` |
| Clean correct cache dirs | `project.ts:312` | Use `framework.devServer.cacheDirectories` |
| Skip angular-specific migration | `project.ts:509-531` | Only for Angular framework ID |

### 4. UI

| Change | File | Detail |
|--------|------|--------|
| Framework Builder page | New: `apps/client/src/app/dashboard/framework-builder/` | Multi-step wizard (mirror Kit Builder pattern) |
| Framework selection on project create | `dashboard.ts` + `.html` | Grid of available frameworks, then kit selection |
| Dynamic greeting | `project.ts:97`, `app.ts:187` | "build a {framework.name} app" |
| Settings tab for frameworks | `profile.html` | List/edit/delete custom frameworks |
| Kit compatibility | Kit Builder + Dashboard | Filter kits by compatible framework |

### 5. Server Routes

| Change | File | Detail |
|--------|------|--------|
| Framework CRUD | New routes or extend `profile` | Load/save/delete framework definitions in user settings |
| Resolve framework at generation time | `ai.routes.ts` | Load FrameworkDefinition by ID from user settings, pass to provider |

---

## Incremental Delivery Plan

### Phase 1: Extract & Abstract (Foundation)
- Split `SYSTEM_PROMPT` into shared core + Angular-specific section
- Define `FrameworkDefinition` interface
- Create the built-in Angular framework definition from existing hardcoded values
- Thread `frameworkId` through data model (Project, API, GenerateOptions)
- `prepareAgentContext` reads from framework definition instead of constants
- Parameterize protected files, nudge command, tool descriptions
- **Result:** Exact same behavior, but Angular config is now a `FrameworkDefinition` object

### Phase 2: Framework Builder UI + React/Svelte Built-ins
- Build the Framework Builder wizard UI (following Kit Builder patterns)
- Create built-in React and Svelte framework definitions
- Framework selection in project creation flow
- Container engine adaptations (port, ready detection, cleanup)
- Dynamic greetings and UI text
- **Result:** Users can create React and Svelte projects; power users can create custom frameworks

### Phase 3: Framework + Kit Integration
- Add `compatibleFrameworks` to Kit interface
- Filter kits by project framework in dashboard
- Framework-aware component doc generation (React props vs Angular selectors)
- Kit Builder gains a framework selector
- **Result:** Component kits are framework-aware

### Phase 4: Polish & Community
- "Generate Knowledge Base" AI feature in Framework Builder
- Framework sharing/export/import
- Visual editing support for React JSX and Svelte templates
- Framework detection from imported project files
- Quick starters per framework
- **Result:** Polished, community-ready framework system

---

## Comparison: Kit Builder vs Framework Builder

| Aspect | Kit Builder | Framework Builder |
|--------|-------------|-------------------|
| Purpose | Teach AI a component library | Teach AI a framework |
| Template files | Optional (override base project) | Required (IS the base project) |
| Knowledge base | Component catalog + .adorable/ docs | Framework patterns & conventions |
| System prompt | Custom instructions (appended) | Custom instructions OR full override |
| Dev server config | No | Yes (port, ready pattern, cache dirs) |
| Protected files | No | Yes (framework config files) |
| Storage | `User.settings.kits[]` | `User.settings.frameworks[]` |
| Built-in defaults | Default Angular 21 kit | Angular 21, React 19, Svelte 5 |
| User-created | Yes | Yes |
| Composable | Framework + Kit together | Framework selected first, then kit |
| Wizard steps | 7 steps | 5 steps |

---

## Adding a New Framework (User Flow)

After the Framework Builder ships, adding Vue 3 support looks like:

1. Open Framework Builder → "New Framework"
2. Name: "Vue 3 (Vite)", Version: "3.5"
3. Import a working Vue + Vite + TS project folder as template
4. Write (or AI-generate) a knowledge base covering Composition API, `<script setup>`, reactivity, Vue Router
5. Set protected files: `vite.config.ts`
6. Set dev server: port 5173, ready pattern `Local:.*localhost`, build output `dist`
7. Save → framework appears in project creation grid

No code changes to Adorable needed. The Framework Builder is the last framework integration you ever build.

---

## The Hard Problem: Visual Editing for Unknown Frameworks

Visual editing — clicking an element in the preview and modifying it — is the hardest challenge for multi-framework support. The current implementation is deeply tied to Angular, and for user-defined frameworks, we don't even know the source format in advance.

### How Visual Editing Works Today

Visual editing has **two distinct phases**:

**Phase 1 — Click Detection (in the preview iframe):** When the user clicks an element in the rendered preview, client-side JavaScript walks the DOM to build an `ElementFingerprint`:
- `tagName`, `text`, `classes`, `id`
- `data-elements-id` attribute (the strongest signal — a unique ID injected by the AI during generation)
- `componentName`, `hostTag` (Angular-specific: the host component)
- `hierarchy` (parent chain for breadcrumb UI)

**This phase is already framework-agnostic.** The rendered HTML is just DOM — it doesn't matter if React, Svelte, or Angular produced it. The `data-elements-id` attribute works everywhere because the AI adds it to the HTML it generates, regardless of framework.

**Phase 2 — Source Modification (in `template.ts`):** Once we have the fingerprint, we need to find and modify the **source file**. This is where everything is Angular-specific:

| Step | Current (Angular) | Why It's Hard for Other Frameworks |
|------|-------------------|-----------------------------------|
| Find component file | Search `.ts` files for `class ComponentName` | React: `function X` or `const X =` in `.tsx`. Svelte: just `X.svelte`. Unknown: ??? |
| Find by selector | Search for `selector: 'app-xxx'` in `@Component` decorator | React/Svelte have no selector concept — components are imported by name |
| Resolve template | Parse `templateUrl: './xxx.html'` or inline `template: \`...\`` from TS decorator | React: JSX is inline in the function body. Svelte: template IS the `.svelte` file. Unknown: no convention |
| Parse template AST | `angular-html-parser` | React: need Babel/TSX parser for JSX. Svelte: need Svelte compiler. Unknown: no parser available |
| Detect loops | Check for `@for` blocks (Angular 17+ syntax) | React: `.map()` calls. Svelte: `{#each}`. Unknown: ??? |
| Handle interpolation | Detect `{{ expr }}` pattern | React: `{expr}` in JSX. Svelte: `{expr}`. Unknown: varies |
| Modify source | AST-based range replacement using source spans | Requires a parser that preserves source positions |

### Approach: Layered Strategy

Instead of requiring a full parser for every framework, we use a layered strategy where each layer provides increasing capability:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Framework Parser Plugin (optional, best UX)   │
│  - Full AST parsing, loop detection, interpolation      │
│  - Ships with built-in frameworks (Angular, React, etc) │
├─────────────────────────────────────────────────────────┤
│  Layer 2: data-elements-id Grep (fast, framework-agnostic)│
│  - String search all source files for the ID            │
│  - Regex-based modification at the match site           │
├─────────────────────────────────────────────────────────┤
│  Layer 1: AI-Delegated Editing (universal fallback)     │
│  - Send fingerprint + intent to AI as a tool call       │
│  - AI reads and modifies the source file itself         │
└─────────────────────────────────────────────────────────┘
```

#### Layer 1: AI-Delegated Editing (Works for ANY Framework)

When visual editing can't be handled directly, delegate to the AI:

```
User clicks element → Fingerprint captured →
  AI prompt: "The user clicked the element with data-elements-id='hero-title'
  (a <h1> with text 'Welcome'). They want to change the text to 'Hello World'.
  Find and modify the source file."
```

**Pros:** Works for literally any framework, even ones that don't exist yet. The AI already understands the source code since it generated it.
**Cons:** Slower (requires an LLM call), uses tokens, less predictable.
**When to use:** Custom/unknown frameworks, or when layers 2-3 fail.

#### Layer 2: `data-elements-id` Grep (Fast, Framework-Agnostic)

The `data-elements-id` attribute is the strongest matching signal (`template.ts:216`). The key insight: **if the AI added `data-elements-id="xxx"` to the output, that exact string exists somewhere in the source files** — regardless of whether it's Angular HTML, React JSX, Svelte markup, or anything else.

```typescript
// Pseudocode for framework-agnostic source location
function findSourceByElementId(files: FileTree, elementId: string): { path: string, offset: number } | null {
  for (const [path, content] of walkFiles(files)) {
    const searchStr = `data-elements-id="${elementId}"`;
    const idx = content.indexOf(searchStr);
    if (idx >= 0) {
      return { path, offset: idx };
    }
  }
  return null;
}
```

Once the file and offset are found, we can apply modifications using **regex-based editing** without needing a full parser:
- **Text change:** Find the text content between the element's opening and closing tags at the offset position
- **Style change:** Find or insert a `style="..."` attribute at the offset position
- **Class change:** Find or insert a `class="..."` / `className="..."` attribute

This works because HTML-like markup (HTML, JSX, Svelte, Vue SFC) all share the same basic `<tag attr="value">content</tag>` structure.

**Pros:** Fast (no LLM call), works across most frameworks, reliable when `data-elements-id` is present.
**Cons:** Can't detect loops, can't handle interpolation, fragile with complex nesting. Only works if the AI consistently adds `data-elements-id` (it does — it's in the system prompt).
**When to use:** Default path for all frameworks. Fails gracefully to Layer 1.

#### Layer 3: Framework Parser Plugin (Best Experience)

For built-in frameworks, we ship proper parsers:

```typescript
interface FrameworkParserPlugin {
  /** File extensions this parser handles */
  extensions: string[];  // e.g. ['.tsx', '.jsx'] or ['.svelte']

  /** Find a component source file by name */
  findComponent(files: FileTree, name: string): { path: string, content: string } | null;

  /** Parse template content into an abstract tree with source spans */
  parseTemplate(content: string): ParsedTemplate;

  /** Find matching node by fingerprint */
  findNode(tree: ParsedTemplate, fingerprint: ElementFingerprint): MatchResult | null;

  /** Apply a modification to the template source */
  applyModification(content: string, node: MatchResult, mod: Modification): string;
}
```

Built-in plugins:

| Framework | Parser | Component Discovery | Template Location |
|-----------|--------|--------------------|--------------------|
| Angular | `angular-html-parser` (current) | `class X` + `@Component` decorator in `.ts` | `templateUrl:` or inline `template:` |
| React | `@babel/parser` with JSX plugin | `function X` / `const X =` in `.tsx`/`.jsx` | Return statement JSX |
| Svelte | `svelte/compiler` `parse()` | Filename match `X.svelte` | Markup section of `.svelte` file |

Custom frameworks work **without a plugin** — they use Layer 2 (grep) with Layer 1 (AI) as fallback. If someone builds a popular framework definition, a community parser plugin could be added later.

### How the Layers Compose at Runtime

```
User clicks element in preview
  ↓
Build ElementFingerprint (framework-agnostic)
  ↓
Does the framework have a Parser Plugin? (Layer 3)
  ├── YES → Use plugin for full AST-based editing
  │         (loop detection, interpolation handling, etc.)
  │         If plugin fails → fall through to Layer 2
  └── NO  → Continue to Layer 2
  ↓
Does the element have a data-elements-id? (Layer 2)
  ├── YES → Grep source files for the ID string
  │         Found? → Apply regex-based modification
  │         Not found? → Fall through to Layer 1
  └── NO  → Continue to Layer 1
  ↓
AI-Delegated Editing (Layer 1)
  → Send fingerprint + modification intent to AI
  → AI reads source, applies change, returns modified file
```

### What This Means for the Framework Builder

The Framework Builder's "AI Rules" step (Step 4) gains an optional **Parser Plugin** field, but only advanced users or built-in frameworks would use it:

```
  4. AI Rules
     ┌─────────────────────────────────┐
     │ Protected files:                │
     │   [x] package.json              │
     │   [x] vite.config.ts            │
     │                                 │
     │ Root component path:            │
     │   [src/App.tsx               ]  │
     │                                 │
     │ Visual editing:                 │
     │   Template extensions:          │
     │   [.tsx, .jsx              ]    │
     │                                 │
     │   Component pattern:            │
     │   [function|const {name}   ]    │
     │   (regex to find components)    │
     │                                 │
     │ Custom instructions:            │
     │   [Always use hooks, never...] │
     └─────────────────────────────────┘
```

Even without configuring visual editing, users get:
- **Layer 2** works automatically (grep for `data-elements-id`)
- **Layer 1** works automatically (AI fallback)

So visual editing **never fully breaks** for custom frameworks — it just works more slowly and with fewer features (no loop detection, no interpolation awareness).

### Ensuring `data-elements-id` Works Across Frameworks

The system prompt already instructs the AI to add `data-elements-id` attributes. This needs to remain framework-agnostic in the shared core:

```
When generating HTML/JSX/template markup, add data-elements-id="descriptive-id"
to important elements (headings, buttons, cards, inputs, images, containers).
These IDs enable visual editing. Use kebab-case descriptive names like
"hero-title", "nav-login-button", "product-card".
```

This instruction works because:
- Angular templates: `<h1 data-elements-id="hero-title">` ✅
- React JSX: `<h1 data-elements-id="hero-title">` ✅
- Svelte markup: `<h1 data-elements-id="hero-title">` ✅
- Vue templates: `<h1 data-elements-id="hero-title">` ✅
- Any HTML-like syntax: ✅

### Impact on Delivery Phases

Visual editing support maps cleanly to the incremental delivery:

| Phase | Visual Editing Capability |
|-------|--------------------------|
| Phase 1 (Extract & Abstract) | Refactor `template.ts` into layered architecture. Extract Angular-specific code into an Angular parser plugin. Layer 2 (grep) becomes the default. Layer 1 (AI) becomes the fallback. |
| Phase 2 (Framework Builder + React/Svelte) | Add React parser plugin (`@babel/parser`). Add Svelte parser plugin (`svelte/compiler`). Custom frameworks get Layers 1+2 automatically. |
| Phase 3 (Kit Integration) | No visual editing changes needed. |
| Phase 4 (Polish) | Improve Layer 2 regex accuracy. Add loop/interpolation hints to framework definitions. Community parser plugin API. |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| AI quality varies across frameworks | Knowledge base quality is key; "Generate with AI" helps bootstrap good ones; built-in frameworks are hand-tuned |
| Complex wizard overwhelms users | Built-in frameworks cover 90% of users; wizard is only for power users. Good defaults throughout |
| Template files get outdated | Users can update their framework definitions; built-ins are updated with Adorable releases |
| Container port conflicts | Detect active port dynamically from dev server stdout rather than assuming |
| Kit incompatibility across frameworks | `compatibleFrameworks` field + UI filtering; kits without the field are shown with a warning |
| Custom frameworks break in unexpected ways | Validation step: "Test Framework" button that scaffolds a project and runs `npm install && npm run build` |
| Visual editing quality varies by framework | Layered strategy ensures it always works (AI fallback), just with different speed/quality. Built-in frameworks get full parser plugins. |
| AI-delegated editing is slow for unknown frameworks | Layer 2 (grep for data-elements-id) handles most cases without LLM calls. AI fallback only fires when grep fails. |
| `data-elements-id` might not always be present | System prompt mandates it. If missing, Layer 1 (AI) can still locate elements by text/class/tag matching in source. |
