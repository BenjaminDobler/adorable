# Workspace Knowledge Graphs — Adorable Desktop

**Status:** Draft plan — not yet validated with an experiment
**Author:** (plan drafted with Claude)
**Companion to:** [`kit-system-library-knowledge-graphs.md`](./kit-system-library-knowledge-graphs.md)
**Target:** Adorable Desktop only

## TL;DR

Build a **workspace kit system** that learns the conventions, architecture, and exported APIs of a user's local workspace (Nx monorepos especially), and injects that knowledge into Adorable's AI pipeline the same way the library-kit system injects UI5 data. This turns "Adorable knows your component library" into "Adorable knows *your codebase*."

Unlike the library-kit system, which ships curated data bundled with Adorable, the workspace kit is **learned at runtime from the user's filesystem**. It runs entirely locally (Desktop-only), never uploads code, and updates incrementally as files change.

**Hypothesis (unvalidated):** a workspace knowledge graph will eliminate the majority of "this code doesn't fit our codebase" friction that users currently experience with AI-generated edits to existing projects. Typical failures we expect to catch:

- New components built from scratch instead of reusing `libs/shared/ui` exemplars
- Module boundary violations (feature libs importing app code, apps bypassing shared libs)
- Wrong state-management pattern (NgRx in a signals-first workspace, vice versa)
- Wrong styling approach (hand-rolled CSS when the workspace uses Tailwind, or vice versa)
- Wrong test framework (Jasmine in a Vitest workspace)
- Made-up imports from non-existent internal libraries
- Re-implementing services that already exist in a shared lib

**This plan depends on the library-kit infrastructure being in place first.** Most of the runtime plumbing (context injection, tool registration, post-gen rescan hook, Prisma `Kit` model) is reused as-is.

## Relationship to the library-kit system

| | Library kit (e.g. UI5) | Workspace kit |
|---|---|---|
| **Source of truth** | Published library manifest (CEM, .d.ts, etc.) | User's local workspace files |
| **Scope** | Framework/library API + framework wrappers | Workspace architecture + conventions + exported symbols |
| **Reusable across users** | Yes, one kit per library version | No, per-workspace |
| **Where built** | CI, shipped in Adorable bundle | User's machine, on project open |
| **Build cost** | Zero at runtime (pre-built) | 5 s to a few minutes first time, faster incrementally |
| **Update trigger** | New library version released | Any file change in the workspace |
| **Size** | Fixed (~1-2 MB) | Scales with workspace (2-20 MB typical) |
| **Privacy model** | Public data, ships with product | User's IP — stays on the device |
| **Where runs** | Cloud + Desktop | **Desktop only** |
| **Cloud editor support** | ✅ | ❌ (privacy + cost reasons) |

**Both systems share:** the `Kit` Prisma model (with a `kind` discriminator), the `ContextBuilder` injection flow with `cache_control`, the `query_*` tool registration pattern, and the post-generation rescan hook. The workspace kit plugs into the same integration points — it's a second `KitService`-like component, not a separate subsystem.

## Why this matters

Adorable's user base is splitting into two shapes:

1. **Greenfield users** — create a new project in Adorable, iterate prompt by prompt. These users are served well by the existing provider + skill system.
2. **Existing-project users** — open a real codebase (usually an Nx monorepo of substantial size), ask Adorable to add a feature, fix a bug, or refactor. These users regularly report that the AI "writes code that doesn't fit our conventions" or "ignores our shared components and builds everything from scratch."

The second group is where the library kit's insight generalizes most powerfully. The same LLM failure modes that hit us with UI5 — **training cutoff drift, rare-API hallucination, framework-wrapper invisibility** — also hit us with **internal workspace conventions**, which are by definition not in any training set.

No model, no matter how recent, has ever seen your internal `libs/shared/auth` library. The only way to teach an LLM about it is to load its signature into the context. A graph is the right shape for that load, for the same reasons explained in the library-kit doc: size, structure, queryability.

## Why this is harder than the library-kit case

Three things make the workspace case harder than the library case:

1. **Conventions are emergent, not documented.** No `README` says "we use signals not NgRx." Nobody wrote down "feature libs can't import other feature libs." These rules exist in the code itself — in 50 `.ts` files that all happen to use the same pattern. Extracting them requires **heuristic inference over samples**, not just manifest parsing.

2. **Freshness matters.** A UI5 kit is valid for months; a workspace kit goes stale the moment a file is written. The ingestion has to support incremental updates driven by Adorable's existing `file_written` SSE events.

3. **Size is unbounded.** A small workspace has 5 projects; a large enterprise Nx monorepo has 200+. The pipeline has to scale gracefully and stay under a reasonable token budget when surfacing the summary. We'll need sampling, truncation, and priority heuristics.

None of these are blockers — they just mean the workspace kit needs more engineering than copying the library-kit code. Expected implementation cost: **5-10 focused days** vs 2-4 for the first library kit.

## Scope

This doc covers:

- Workspace ingestion pipeline (5 stages)
- Heuristic convention detectors
- Module-boundary rule extraction
- Exemplar identification via centrality
- Data model extensions (reuse library-kit `Kit` model with a `kind` discriminator)
- Runtime triggering (project open, file change) — Desktop-only
- Incremental update strategy
- `query_workspace` tool surface
- Post-generation rescan for convention/boundary violations
- UX surface
- Rollout order

Out of scope:

- Non-Nx workspaces (standalone Angular projects without Nx) — future work, much of the pipeline still applies
- Non-Angular workspaces (React, Vue, etc.) — future work, would need framework-specific detectors
- Cloud editor support — explicitly not shipping; see the Privacy section
- Workspace-to-library-kit promotion (auto-detecting that an internal lib should be indexed as a shared kit) — captured in the long-term roadmap section

## Terminology

- **Workspace** — a user's local directory containing either a standalone project or an Nx monorepo. Adorable Desktop has filesystem access to this.
- **Workspace kit** — the generated knowledge graph + summary for one workspace, stored in `<workspace>/.adorable/` and never uploaded.
- **Project** (in Nx terms) — an app or library inside a workspace. Each has a `project.json` and a name.
- **Exemplar** — a component/service/module that the workspace depends on heavily (high-degree node in the graph). Used as a "copy this pattern" reference.
- **Convention** — an emergent pattern inferred from the code (e.g. "this workspace uses signals for state") with an evidence count and confidence level.
- **Module boundary rule** — a constraint from `@nx/enforce-module-boundaries` (e.g. "feature libs can depend on ui libs and data-access libs, nothing else").

## How the workspace graph is generated

The pipeline runs locally on the user's machine in the Electron main process, uses only Node APIs and local tooling, and never makes a network request. It has **5 stages**:

```
                  ┌─────────────────────────┐
   Stage 1.       │  nx graph / devkit API  │  <5 sec
   Project graph  │  project.json × all     │
                  └────────────┬────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
   Stage 2.       │  ts-morph signatures    │  ~10-60 sec
   Code signatures│  public-api.ts × all    │
                  └────────────┬────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
   Stage 3.       │  heuristic detectors    │  ~5-20 sec
   Conventions    │  sample × 5 files/proj  │
                  └────────────┬────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
   Stage 4.       │  .eslintrc parsing       │  <1 sec
   Boundaries     │  module-boundary rules   │
                  └────────────┬────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
   Stage 5.       │  centrality + ranking    │  <1 sec
   Exemplars      │  god-node identification │
                  └────────────┬────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
                  │  workspace-graph.json    │  2-20 MB
                  │  workspace-summary.md    │  <10 KB
                  │  → .adorable/            │
                  └─────────────────────────┘
```

### Stage 1 — Project graph ingestion

Nx already computes the complete project graph and exposes it via a programmatic API. The ingestion shells out or calls in-process:

```ts
import { createProjectGraphAsync } from '@nx/devkit';

const graph = await createProjectGraphAsync();
// graph.nodes[name] = { type: 'app'|'lib', data: { root, sourceRoot, targets, tags, ... } }
// graph.dependencies[name] = [{ source, target, type }, ...]
```

For workspaces without Nx, fall back to reading `package.json`, `tsconfig.base.json` path aliases, and scanning for Angular project markers (`project.json` or `angular.json`). The non-Nx path is lower fidelity but still useful.

**Emitted nodes/edges:**

```
nodes:
  project:libs/shared/ui        → { type: 'lib', tags: ['scope:shared', 'type:ui'], root, targets }
  project:apps/storefront       → { type: 'app', tags: ['scope:storefront', 'type:app'], ... }
  project:libs/feature/checkout → { type: 'lib', tags: ['scope:storefront', 'type:feature'] }
edges:
  project:apps/storefront        —depends_on→ project:libs/feature/checkout
  project:libs/feature/checkout  —depends_on→ project:libs/shared/ui
  project:libs/feature/checkout  —depends_on→ project:libs/shared/data-access
```

**Runtime:** 1-5 seconds depending on workspace size. Nx caches the graph computation, so subsequent calls within the same process are near-instant.

### Stage 2 — Code signature extraction

For each project from Stage 1, open the project's barrel file (`public-api.ts`, `index.ts`, or whatever the `main` in `ng-package.json` points to) with **ts-morph** and walk the exports.

**ts-morph is the right tool here** — not tree-sitter, not manual regex. Reasons:

1. Ts-morph wraps the real TypeScript compiler. Types are resolved, not just parsed.
2. It handles re-exports (`export * from './foo'`) correctly.
3. It reports decorator arguments as structured objects, not strings.
4. It's deterministic and relatively fast (~10 ms per file for typical Angular code).
5. Angular components, services, pipes, and directives all use decorator metadata — ts-morph reads this natively.

For each exported symbol, extract:

| Symbol kind | What to extract |
|---|---|
| `@Component` | selector, standalone flag, imports list, inputs, outputs, inline template length, styleUrl count |
| `@Injectable` | providedIn value, constructor dep list, public method signatures |
| `@Directive` | selector, hostBindings, hostListeners |
| `@Pipe` | name, transform signature |
| `interface` / `type` | field signatures (for domain types that other libs import) |
| `function` | signature, JSDoc first line |
| `const` / exported value | type, JSDoc first line |

**Emitted nodes/edges:**

```
nodes:
  symbol:LoadingButtonComponent   → { kind: 'component', selector: 'app-loading-button', standalone: true, inputs: [...], outputs: [...] }
  symbol:AuthService              → { kind: 'service', providedIn: 'root', methods: [...], deps: [...] }
  symbol:Product                  → { kind: 'type', fields: [...] }
edges:
  symbol:LoadingButtonComponent  —exported_from→ project:libs/shared/ui
  symbol:AuthService             —exported_from→ project:libs/shared/auth
  project:libs/feature/checkout  —uses_symbol→   symbol:LoadingButtonComponent
  symbol:AuthService             —injects→       symbol:HttpClient
```

**Runtime:** this scales with the number of exported symbols. For a 100-project workspace with ~15 exports per project, that's ~1,500 symbols → ~15-30 seconds on a warm filesystem. Parallelizable per project via worker threads if needed.

### Stage 3 — Convention mining

The most novel and most valuable stage. For each project, sample 5-10 representative files (prefer recently-modified ones — they reflect current conventions better than old ones) and run a panel of **heuristic detectors**:

```ts
interface Detector {
  name: string;
  detect(files: FileContent[]): {
    convention: string;
    evidence: number;
    total: number;
    confidence: 'high' | 'medium' | 'low';
  };
}
```

Proposed detector set for v1:

| Detector | What it looks for | Conventions it returns |
|---|---|---|
| `stateManagement` | Imports of `@ngrx/*`, `rxjs/BehaviorSubject`, Angular `signal()` calls | `ngrx` / `signals` / `rxjs-subjects` / `mixed` |
| `changeDetection` | `ChangeDetectionStrategy.OnPush` presence in decorators | `onpush-default` / `default` / `mixed` |
| `standaloneVsModule` | `standalone: true` presence vs `NgModule` declarations | `standalone` / `ngmodule` / `mixed` |
| `testFramework` | Imports in `*.spec.ts` files (`@jest/globals`, `vitest`, `karma`) | `jest` / `vitest` / `karma` / `none` |
| `stylingApproach` | `.scss` vs `.css` files, Tailwind class regex in templates, CSS module imports | `scss` / `tailwind` / `scss+tailwind` / `css-modules` / `inline-styles` |
| `httpPattern` | Direct `HttpClient.get` vs custom base service inheritance vs NgRx effects | `direct-httpclient` / `base-service` / `ngrx-effects` |
| `errorHandling` | `catchError` in rxjs pipes, `try/catch` prevalence, custom `ErrorHandler` | `rxjs-catcherror` / `try-catch` / `custom-handler` / `minimal` |
| `routingStyle` | `loadComponent` vs `loadChildren` vs direct component in routes | `standalone-routes` / `module-routes` / `mixed` |
| `namingConvention` | File name patterns (`.component.ts`, `-page.ts`, `.facade.ts`) | emit discovered suffixes |
| `i18n` | `@ngx-translate` imports, Angular `$localize` usage, transloco imports | detected library or `none` |
| `iconSystem` | Common icon imports (Material Icons, UI5, Heroicons, custom) | detected source |

Each detector returns something like:

```json
{
  "detector": "stateManagement",
  "convention": "signals",
  "evidence": 47,
  "total": 50,
  "confidence": "high"
}
```

The graph stores these as `Convention` nodes with edges to the projects they cover. Only high-confidence conventions (>80% evidence) get surfaced in the summary as mandatory rules. Medium-confidence (50-80%) become suggestions. Low-confidence (<50%) are logged but omitted from the summary.

**Detectors must be deterministic.** No LLM calls in this stage. Heuristics only. This keeps the cost bounded and the output reproducible.

**User override:** `<workspace>/.adorable/workspace-kit-overrides.json` lets the user correct detector output manually:

```json
{
  "conventions": {
    "stateManagement": "signals",
    "stylingApproach": "tailwind"
  },
  "disabledDetectors": ["errorHandling"]
}
```

### Stage 4 — Module boundary rule extraction

Parse `.eslintrc.json`, `eslint.config.js`, or `.eslintrc.*` looking for the `@nx/enforce-module-boundaries` rule. The rule has a `depConstraints` array of the form:

```json
{
  "sourceTag": "type:feature",
  "onlyDependOnLibsWithTags": ["type:ui", "type:data-access", "type:util"]
}
```

Emit as `ModuleBoundaryRule` nodes with `allows_depend_on` edges between tag pairs:

```
boundary:type:feature  —allows_depend_on→  tag:type:ui
boundary:type:feature  —allows_depend_on→  tag:type:data-access
boundary:type:feature  —allows_depend_on→  tag:type:util
```

**Cross-reference against actual dependencies from Stage 1** to find **existing violations**. These are technical debt the user presumably knows about — the workspace kit should mark them but not fail on them, and should instruct the LLM explicitly not to add more.

### Stage 5 — Exemplar identification

Run degree centrality over the edges from Stage 2 — specifically the `uses_symbol` edges. Components and services with the highest in-degree (most dependents) are **implicit best-practice references**: if 15 features depend on `LoadingButtonComponent`, it's the canonical button, and new code should use it rather than building a new button.

Mark the top ~10 per kind as `exemplar: true` in the graph. The summary lists them explicitly so the LLM knows where to look for reference patterns.

Also identify **stale or deprecated exemplars** — symbols with a `@deprecated` JSDoc tag that still have dependents. Surface these as "don't use this, the team is migrating away" warnings.

### Final outputs

At the end of the pipeline, two files are written to `<workspace>/.adorable/`:

**`workspace-graph.json`** — the full queryable graph. Consumed only by the `query_workspace` tool at runtime, never injected directly. Structure mirrors the library-kit graph: flat node + edge arrays with stable IDs. Size: 2-20 MB depending on workspace size.

**`workspace-summary.md`** — the system-prompt addendum. Kept under 10 KB by strict truncation. Contains:

1. **Tech stack line** — "Angular 21, standalone, signals, Vitest, SCSS+Tailwind, Nx 21, no NgRx"
2. **Project index** — top 15-25 projects by dependency count with one-line descriptions
3. **Module boundary rules** — the constraints from Stage 4, rendered as English sentences ("Feature libraries can depend on UI libraries, data-access libraries, and util libraries — nothing else.")
4. **Conventions with high confidence** — list from Stage 3, only high-confidence items
5. **Exemplars** — top 5-10 components/services to use as references, each with a one-line description
6. **Deprecated/migrating** — warnings about things not to use
7. **Pointer to `query_workspace`** — "for per-project detail, call `query_workspace('project', 'libs/shared/ui')` etc."

Both files are **gitignored** (Adorable adds them automatically to `.gitignore` the first time they're written).

## Architecture

### Reusing the library-kit infrastructure

**Almost everything in the library-kit plan carries over.** The workspace kit does NOT need a new provider, a new SSE channel, a new database, or a new tool-execution pipeline. It hooks into the same points:

- **Prisma model:** extend the existing `Kit` model with a `kind: 'library' | 'workspace'` discriminator. `ProjectKit` works unchanged. Workspace kits have `kind='workspace'` and can have `summaryPath` / `graphPath` pointing to `<workspace>/.adorable/workspace-*` rather than an asset bundle.
- **`ContextBuilder`:** already handles kit summary injection with `cache_control`. Workspace summary joins the list of injected blocks.
- **Tool registration:** a new tool `query_workspace` sits alongside `query_kit`, registered in the same `buildToolList` logic when a workspace kit is attached.
- **Post-generation rescan hook:** already runs after the main agentic loop. A workspace-kit validator plugs in with its own finding types (module boundary violations, convention drift).

**New infrastructure required:**

1. `WorkspaceKitService` — the ingestion pipeline + cache management
2. File-watcher integration for incremental updates (leverages the existing `file_written` SSE events)
3. One new tool (`query_workspace`) in `tools.ts` + a case in `tool-executor.ts`
4. Electron main-process hook to trigger ingestion on project open
5. A progress UI for first-time indexing (Desktop only)

### Data model extension

```prisma
model Kit {
  id             String   @id @default(cuid())
  name           String   @unique
  displayName    String
  kind           String   @default("library")   // NEW: "library" | "workspace"
  packageNames   String                          // JSON array
  version        String
  libVersion     String?                         // nullable for workspace kits
  summaryPath    String                          // for library: relative to assets/kits/
                                                  // for workspace: absolute path to .adorable/
  graphPath      String
  workspaceRoot  String?                         // NEW: absolute path, workspace kits only
  enabledByDefault Boolean @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  projectKits    ProjectKit[]
}
```

A workspace kit has `kind="workspace"`, `workspaceRoot` set to the local directory, `summaryPath` and `graphPath` pointing to files inside `<workspaceRoot>/.adorable/`. The kit is created lazily when the user opens a workspace, and deleted when they close it. No bundled asset.

**Desktop DB sync:** add the `kind` and `workspaceRoot` columns to `apps/desktop/db-init.ts`, with a migration entry. Nothing else about the Desktop schema needs to change.

### The `WorkspaceKitService`

New file: `apps/server/src/services/workspace-kit/workspace-kit.service.ts`

```ts
export class WorkspaceKitService {
  private cache = new Map<string, LoadedWorkspaceKit>();

  /**
   * Idempotent — returns cached kit if graph.json is newer than all watched files,
   * otherwise runs the ingestion pipeline.
   */
  async ensureIndexed(workspaceRoot: string): Promise<LoadedWorkspaceKit>;

  /**
   * Incremental update for a single project. Called by the file-change hook.
   * Re-runs Stages 2-3 for just this project, merges into the existing graph.
   */
  async reindexProject(workspaceRoot: string, projectName: string): Promise<void>;

  /**
   * Full rebuild. Called when nx.json / project.json / tsconfig*.json changes,
   * or on explicit user action.
   */
  async rebuild(workspaceRoot: string): Promise<LoadedWorkspaceKit>;

  /**
   * Tool implementation. Answers `query_workspace("<verb>", "<arg?>")` queries.
   */
  queryWorkspace(workspaceRoot: string, query: string): string;

  /**
   * Post-gen validator. Returns findings: module boundary violations,
   * unknown-symbol references, convention drift.
   */
  validateWorkspaceUsage(
    workspaceRoot: string,
    files: Map<string, string>,
  ): Finding[];
}
```

The ingestion pipeline (Stages 1-5) lives in sibling files:

```
apps/server/src/services/workspace-kit/
├── workspace-kit.service.ts
├── stage1-project-graph.ts       // nx / fallback
├── stage2-signatures.ts          // ts-morph
├── stage3-conventions.ts         // detector panel
├── stage4-boundaries.ts          // eslint rule parsing
├── stage5-exemplars.ts           // centrality
├── detectors/                    // one file per convention detector
│   ├── state-management.ts
│   ├── styling-approach.ts
│   ├── change-detection.ts
│   ├── test-framework.ts
│   ├── ... (one per detector)
│   └── types.ts
├── query-workspace.ts            // tool implementation
├── rescan-workspace.ts           // post-gen validator
└── types.ts
```

### Runtime triggering

The service is triggered from three places:

1. **On project open** (Electron main process hook) — when the user opens a workspace in Desktop, call `WorkspaceKitService.ensureIndexed(workspaceRoot)`. If a fresh graph is cached, use it immediately. If not, show a progress indicator and run the pipeline. The user can start prompting before indexing completes — Stage 1 (the project graph alone) gives useful context within a few seconds.

2. **On file change** — `file_written` SSE events already fire when the AI writes files. Add a listener that:
   - Finds which project the file belongs to (match path prefix against project roots)
   - Calls `reindexProject` for that project
   - Debounces — if 10 files change in quick succession, batch into one reindex
   - Handles config-file changes (`nx.json`, `project.json`, `package.json`, `tsconfig*.json`) by triggering a full `rebuild` in the background

3. **On explicit user action** — a "Rebuild workspace index" command in the Desktop menu, for cases where something drifts.

### The `query_workspace` tool surface

```
query_workspace("project-graph")
  → high-level graph: apps and libs with their dependencies
  → ~50-200 lines of text, one line per project with deps

query_workspace("project", "libs/shared/ui")
  → full info on one project: path, tags, targets, exported symbols (names + kinds)
  → ~20-100 lines

query_workspace("exports", "@myorg/shared/ui")
  → all symbols exported from this import path, with signatures
  → useful when the LLM is about to hallucinate an import

query_workspace("symbol", "LoadingButtonComponent")
  → full signature of one symbol + list of its consumers
  → useful when deciding whether to reuse or build new

query_workspace("similar", "feature/checkout")
  → find 3 structurally similar projects as reference patterns
  → based on tag overlap + dependency shape

query_workspace("boundaries", "libs/feature/checkout")
  → what this project can and cannot depend on, per module boundary rules
  → includes existing violations (pre-existing tech debt, do not add more)

query_workspace("conventions")
  → dump of all detected conventions with evidence counts
  → rarely needed — the summary already covers this

query_workspace("exemplars")
  → list of top 5-10 canonical components/services
  → with one-line descriptions and import paths
```

Same query-verb pattern as `query_kit`. Consistent vocabulary reduces the LLM's cognitive load when it has both kits active.

### Post-generation validator

Port the library-kit detector pattern. Workspace-specific finding types:

| Finding kind | What it catches |
|---|---|
| `workspace_unknown_symbol` | Import from `@myorg/something` that doesn't exist in the graph |
| `workspace_unused_exemplar` | New component built when an exemplar exists (e.g. new button when `LoadingButtonComponent` is available) |
| `workspace_boundary_violation` | Dependency that breaks a module boundary rule |
| `workspace_convention_drift_state` | Uses NgRx when the workspace convention is signals (or vice versa) |
| `workspace_convention_drift_styling` | Uses raw CSS when the workspace convention is Tailwind |
| `workspace_convention_drift_standalone` | Uses `NgModule` when the workspace convention is `standalone: true` |
| `workspace_wrong_test_framework` | Uses Jasmine in a Vitest workspace |

Not every convention drift should fail — some should warn. For v1: **violations fail the rescan (one fix-it turn), drift only logs**. We can tighten later based on user feedback.

## Privacy model

**This feature is Desktop-only, and that's a feature, not a limitation.**

1. Cloud editor would require uploading the workspace to the server — a non-starter for any serious user with proprietary code
2. Desktop already has filesystem access and can do everything locally
3. The graph is written to `<workspace>/.adorable/` which is gitignored automatically
4. The LLM provider sees only **subgraphs the model queries** via `query_workspace` — not the full graph
5. The summary injected into the system prompt contains aggregated, anonymized information (project names, tech stack, conventions) — not file contents

**This makes Desktop strictly more powerful than Cloud** for existing-project use cases, which is good for the product narrative. Cloud stays valuable for greenfield projects; Desktop wins on existing workspaces.

Users who want the feature on Cloud can still use it — they just run Adorable Desktop locally against their workspace. No server-side code needed.

## UX surface

Minimal, non-intrusive, opt-out rather than opt-in:

1. **First-open indexing** — when the user opens a workspace containing `nx.json` or any Angular project marker, Adorable shows a small progress bar in the status area: "Indexing workspace (3/5 stages)..." with an option to cancel. Takes 10-60 seconds typically. User can start prompting immediately — Stage 1 data is available within ~5 seconds.

2. **Subtle indicator** — once the kit is loaded, a small badge appears near the AI input: "Workspace kit: 47 projects, 312 symbols". Click for details.

3. **Project settings panel** — a "Workspace Kit" section listing detected conventions and letting the user:
   - Toggle the whole kit on/off
   - Override individual detector results
   - Disable specific detectors
   - Trigger a manual rebuild
   - View the generated summary.md

4. **Inline warnings in chat** — when the post-gen validator finds a convention drift that was fixed, surface a small message: "Your workspace uses signals for state management, but the initial generation used NgRx. I've corrected this."

5. **Exemplar suggestions** — when the user asks for something that matches an exemplar's shape, Adorable can proactively suggest "There's already a `LoadingButtonComponent` in `libs/shared/ui` that handles this — should I use it?"

## Rollout order

Ship the library kit first (per the library-kit doc), then layer workspace kits in this order:

1. **Extend the `Kit` Prisma model** with `kind` and `workspaceRoot` columns. Migration + desktop db-init sync.
2. **Build Stages 1 + 2 of the pipeline** (nx project graph + ts-morph signatures). This alone is useful — knowing "what projects exist, what they export, how they depend on each other" is most of the value. Skip conventions, boundaries, and exemplars initially.
3. **Wire `WorkspaceKitService.ensureIndexed` into the Electron project-open flow.** Add the progress UI.
4. **Add `query_workspace` tool** with the first four verbs (`project-graph`, `project`, `exports`, `symbol`). Hook into `ContextBuilder` for summary injection.
5. **Test on real workspaces** — first your own `/Users/benjamindobler/workspace/adorable`, then a few friendly users' monorepos. Measure: does the LLM actually use `query_workspace`? Does hallucinated-import rate drop?
6. **Build Stage 3 — convention detectors.** Add them incrementally, one per week. Start with the highest-impact ones: `stateManagement`, `standaloneVsModule`, `stylingApproach`.
7. **Build Stage 4 — module boundary parsing.** Ship once stable.
8. **Build Stage 5 — exemplar identification.** Ship once stable.
9. **Build the incremental update path.** Hook into `file_written` SSE events. Initially debounced rebuild; optimize to per-project reindex later.
10. **Build the post-gen validator** with workspace-specific finding types. Start with `workspace_unknown_symbol` and `workspace_boundary_violation`. Add convention-drift checks incrementally.
11. **Build the settings UI** for kit toggle and overrides.

**Milestone 1 (steps 1-5):** usable skeleton. Ships in ~5 days. Even without conventions, knowing the project graph + exported symbols is a huge improvement over nothing.

**Milestone 2 (steps 6-9):** full pipeline with conventions and incremental updates. Another ~5 days.

**Milestone 3 (steps 10-11):** validator + UX polish. Another ~3 days.

Total estimated implementation cost: **~10-13 days of focused work**, assuming the library kit system is already shipped and its infrastructure is reusable.

## Open questions

1. **How big is too big?** What's the upper bound on a workspace we can index in reasonable time? A 500-project Nx monorepo might take 5+ minutes for Stage 2 alone. Do we need parallelization, sampling, or a "top N projects" strategy? — *Proposal:* start without optimization, measure on real workspaces, add worker threads if p99 exceeds 2 minutes.

2. **How do we handle non-Angular code in the workspace?** A typical Nx workspace has some Node libraries, some utility packages, maybe a React app. Do we index everything or only Angular projects? — *Proposal:* index everything for the project-graph layer (Stage 1), but limit Stage 2 (signature extraction) to Angular projects initially. Other languages can come later with their own detectors.

3. **What about monorepos without Nx (pnpm / yarn workspaces)?** Can we extract useful info without Nx's project graph? — *Proposal:* yes, but lower fidelity. Read `pnpm-workspace.yaml` or `package.json` workspaces field, scan for Angular projects, skip module-boundary rules (since they come from Nx). Ship Nx support first.

4. **Convention detector reliability.** Heuristics will be wrong sometimes. How do we handle false positives gracefully? — *Proposal:* (a) always show evidence counts so the LLM can reason about confidence; (b) let users override via `overrides.json`; (c) never make low-confidence conventions mandatory rules; (d) the post-gen validator only warns on convention drift, doesn't fix it.

5. **How fresh does incremental update need to be?** If the AI writes 10 files in one generation, do we reindex after each or after the batch? — *Proposal:* debounce 500ms. Reindex per project, not per file. Block further generation if an incremental update is in progress (rare, usually <1 second).

6. **Two kits at once.** If a user has UI5 + a workspace kit, both summaries go into the system prompt. How do we bound total cost? — *Proposal:* cap total kit content at **20 KB**. If the sum exceeds that, truncate the workspace summary (library kit usually has higher per-token value and should be preserved).

7. **Workspace-to-kit promotion.** When a workspace has an internal library that looks like a shared UI kit (`libs/shared/ui`), could we automatically promote it into a full library-kit with its own graph? — *Future work. Captured in the long-term roadmap below.*

8. **Cache invalidation by branch switch.** Git branch changes can shift most of the workspace. How do we detect and rebuild? — *Proposal:* watch `.git/HEAD`. On change, trigger a full rebuild. Blocks new generations for ~30 seconds on large workspaces (shown with a progress indicator).

## Long-term roadmap

Five follow-on features that become possible once the workspace kit infrastructure exists:

### 1. Auto-promotion of internal libraries to library kits

When Stage 5 (exemplar identification) discovers that a project depends heavily on an internal library (e.g. `libs/shared/ui` with 40+ components used across 20+ features), offer to promote it to a full library kit. Run the library-kit ingestion pipeline against the internal library's public API, generate a dedicated graph and summary, register it as a `kind='library'` kit with `workspaceRoot` set. This gives the internal library the same treatment as UI5 or Material — including post-gen validation and dedicated summary injection. **High value for enterprise customers with internal design systems.**

### 2. Cross-workspace kit sharing

Team members on the same codebase generate the same workspace graph. Let them share the graph + summary via a small git-committed file (`.adorable/kit-cache.json`) that's version-controlled. First-open indexing becomes "download from git" instead of "recompute from scratch." Only works for teams that opt in, but saves significant time for new team members joining an established codebase.

### 3. Convention drift detection over time

Persist a snapshot of conventions from each build. Compare across time. When the workspace drifts (e.g. team starts mixing signals and NgRx), surface a report: "Your state management convention dropped from 98% signals to 76% signals over the last month. You may have an inconsistent pattern spreading." Not immediately useful for the AI, but useful for tech leads doing codebase health reviews.

### 4. Blast-radius analysis for refactoring prompts

Once the graph has `uses_symbol` and `depends_on` edges (which it does after Stage 2), we can answer "when the AI modifies `AuthService.login()`, what else might break?" by traversing the graph backwards from the changed symbol to every caller, dependent, and test file. This is particularly valuable for refactoring-style prompts ("rename this method", "change this signature", "extract this into a new library") where the AI needs to update multiple files coherently.

Expose as `query_workspace("blast-radius", "AuthService.login")` → returns the minimal set of files that should be considered for the change. The AI can then `read_files` that exact set instead of grepping the entire workspace, dramatically reducing exploration turns.

**Prior art:** [`code-review-graph`](https://github.com/tirth8205/code-review-graph) implements this as a first-class feature for the code-review use case — given a git diff, it computes which files could be affected and tells the AI to read only those. Their benchmarks show 100% recall on affected-file detection across 6 real repositories. We can adapt the same algorithm for the code-generation case (transitive closure from a changed symbol rather than a changed file). See the **Prior art** section below for more.

### 5. Expose workspace and library kits as MCP servers for external AI tools

Our kit artifacts — graph, summary, query tool, validator — don't depend on Adorable's runtime beyond simple JSON loading and string matching. They're portable. A logical follow-on is packaging them as standalone MCP servers that any MCP-capable assistant (Claude Code, Cursor, Zed, Windsurf, Continue, etc.) can consume.

Concrete shape: a CLI named something like `adorable-kits` that:

1. `adorable-kits list` — show available bundled library kits
2. `adorable-kits install --kit ui5-ngx --platform claude-code` — write the MCP config for the target tool
3. `adorable-kits workspace index <path>` — run the workspace-kit pipeline on a local directory and expose it as an MCP server

This gives Adorable's kit work a life beyond the Adorable product itself. A UI5 developer who uses Cursor could install the UI5 kit and get the same benefits. More importantly, it builds a distribution surface for future kits — each new kit we author becomes available to the broader AI-assisted-coding ecosystem, which is a strong distribution play even for users who don't adopt Adorable proper.

**Prior art:** [`code-review-graph`](https://github.com/tirth8205/code-review-graph) ships this exact pattern — one-command install that auto-detects the user's AI tool and writes the correct MCP config. Their CLI is the reference implementation to study when we're ready to build ours.

## Prior art

Two existing tools are worth studying before building the workspace-kit pipeline. Neither is a drop-in replacement for what we want, but both have already solved problems we'll face.

### `code-review-graph` — incremental-update strategy and MCP packaging

- **Repo:** https://github.com/tirth8205/code-review-graph
- **What it is:** A tree-sitter-based structural code graph built for AI code review. 19 languages, SQLite storage, MCP-server delivery, incremental updates, blast-radius analysis. Python 3.10+, MIT licence.
- **Benchmarked claims:** 8.2× average token reduction across 6 real repos (fastapi, flask, gin, httpx, nextjs, express), 100% blast-radius recall, under 2 seconds to re-index a 2,900-file repo on incremental update.

**Overlap with workspace-kit plan:**

| Capability | Workspace kit | code-review-graph |
|---|---|---|
| Project structure + call graph | ✅ Stages 1–2 | ✅ |
| Incremental updates | ✅ planned | ✅ **implemented + benchmarked** |
| Blast-radius analysis | Possible via graph traversal | ✅ **first-class feature** |
| Framework decorator metadata (`@Component`, `@Input`, `@Output`) | ✅ via ts-morph | ❌ tree-sitter is syntactic only |
| Nx project graph, tags, module boundaries | ✅ Stages 1+4 | ❌ |
| Convention detectors | ✅ Stage 3 | ❌ purely structural |
| MCP server delivery | ❌ not planned v1 | ✅ |
| Language | TypeScript | Python |
| Goal shape | Generation quality | Token reduction during review |

**What we take from it:**

1. **Their incremental-update implementation is a working reference.** SHA-256 hash per file, diff on change, walk the existing graph to find dependents, re-parse only what changed. Read their code before writing Stage 9 of our rollout — likely saves a day of design work.
2. **Blast-radius analysis** is added as roadmap item #4 above.
3. **Their MCP CLI distribution pattern** is the blueprint for roadmap item #5.

**What we don't take:**

- **Not a dependency.** Python sidecar adds install complexity and won't give us decorator-level framework awareness. We build our own in Node with ts-morph.
- **Not a replacement for Stage 2.** Tree-sitter can parse TypeScript, but it doesn't resolve types or understand decorator metadata semantically. ts-morph (which wraps the TypeScript compiler API) does both. That capability gap is where the workspace kit's value lives.
- **Not their benchmarks.** They measure retrieval efficiency (tokens saved when reading); we measure generation quality (defects in output). Different objective functions.

**Potential complementary use:** For Cloud-editor users who import a large existing repo, code-review-graph could fit as a retrieval layer — server-side, Python-in-a-container is fine in that setting. This is a separate feature arc from the Desktop workspace kit and is not in scope for this plan.

### `graphify` — curated knowledge graphs for coding assistants (earlier reference)

The original prompt for this whole exploration was [`graphify`](https://github.com/safishamsi/graphify), which builds graphs from arbitrary folders including code, docs, papers, and images. We declined to use it for Adorable because:

- It's Python (same friction as code-review-graph)
- It uses LLM-based semantic extraction for non-code inputs, which makes ingestion expensive and non-deterministic — exactly the opposite of what we want for a workspace kit
- Its polyglot scope (code + papers + images) is broader than we need and yields weaker per-input results than a framework-aware extractor

It's mentioned here only so future reviewers know we considered it. The current plan stays with purpose-built, deterministic, framework-aware ingestion.

## Files likely to change

- `prisma/schema.prisma` — extend `Kit` model with `kind` and `workspaceRoot` columns
- `prisma/migrations/` — new migration
- `apps/desktop/db-init.ts` — matching column additions + migration entry + version bump
- `apps/server/src/services/workspace-kit/` — new directory, full pipeline (see earlier file listing)
- `apps/server/src/providers/context-builder.ts` — extend to include workspace kit summaries alongside library kit summaries
- `apps/server/src/providers/tools.ts` — add `QUERY_WORKSPACE_TOOL` definition
- `apps/server/src/providers/tool-executor.ts` — `query_workspace` case
- `apps/server/src/providers/base.ts` — extend post-gen rescan hook to include workspace validator
- `apps/desktop/src/main.ts` (or equivalent) — hook project-open to trigger indexing, progress UI over IPC
- `apps/client/src/app/features/editor/...` — progress indicator component, settings UI, workspace-kit badge
- `apps/server/src/routes/projects.routes.ts` (or a new endpoint) — REST/SSE endpoint for triggering manual rebuilds and reading kit status

## References

- Companion doc: [`kit-system-library-knowledge-graphs.md`](./kit-system-library-knowledge-graphs.md) — the library-kit plan this extends
- Nx programmatic API: `@nx/devkit` → `createProjectGraphAsync`
- ts-morph docs: https://ts-morph.com
- Existing infrastructure: `apps/server/src/providers/` (base, tools, context-builder, tool-executor)
- Desktop DB sync: `apps/desktop/db-init.ts` (per `CLAUDE.md` requirement)
- Prior art — structural code graph + MCP server: https://github.com/tirth8205/code-review-graph
- Prior art — polyglot knowledge graph with LLM extraction: https://github.com/safishamsi/graphify
