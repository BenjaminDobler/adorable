# Kit System — Library Knowledge Graphs for Adorable

**Status:** Draft plan — experimental validation complete, integration not yet started
**Author:** (experiment + plan drafted with Claude)
**Related experiment:** `experiments/ui5-kit-graph/`
**Companion doc:** [`workspace-knowledge-graphs.md`](./workspace-knowledge-graphs.md) — Desktop-only extension that applies the same mechanism to a user's local Nx workspace instead of a curated library
**Decision doc:** [`kit-system-delivery-format-decision.md`](./kit-system-delivery-format-decision.md) — documents the delivery-format decision (graph+tool vs markdown files vs both), the discovery that Adorable's existing kit infrastructure covers most of the original plan, and the revised ship sequence

## TL;DR

Ship a **Kit system** that injects curated, versioned knowledge about third-party component libraries into Adorable's AI generation pipeline. Pilot kit: **UI5 Web Components for Angular (`@ui5/webcomponents-ngx`)**.

Validated by an end-to-end experiment comparing a baseline generation against a kit-augmented generation on two Angular+UI5 prompts:

| Scenario | Issues per generation | Cost per generation (warm cache) |
|---|---|---|
| Baseline (no kit) | **15–23** pattern-level defects | $0.09–$0.25 |
| Kit-augmented | **0** | $0.15–$0.22 |

The kit-augmented path is **40% cheaper** than baseline on the easy prompt (because it stays on-scope and writes fewer files) and ~$0.13 more expensive on the hard prompt. On average across both prompts, kit cost is slightly **below** baseline while producing zero defects instead of ~19. See `experiments/ui5-kit-graph/results/report.md` and `results-hard/report.md` for the raw numbers.

## Why this matters

Adorable's users increasingly bring real, non-trivial Angular projects — including projects built on component libraries like UI5 Web Components, Angular Material, PrimeNG, shadcn-ng, or internal company design systems. LLMs do not reliably generate idiomatic code for these libraries because:

1. **Training data is uneven.** Popular libraries are well-represented; niche or enterprise ones are not.
2. **Version drift.** Training data contains old, renamed, or deprecated APIs.
3. **Framework wrappers change the API surface.** For example, `@ui5/webcomponents-ngx` renames every DOM event (`click` → `ui5Click`, `selection-change` → `ui5SelectionChange`), exposes real Angular `@Input()`s instead of HTML attributes, and requires importing component classes rather than raw custom-element registration files. Raw-LLM output defaults to the HTML/custom-element pattern, which compiles via `CUSTOM_ELEMENTS_SCHEMA` but is **fundamentally non-idiomatic**.

Our baseline experiment produced code on both prompts that:

- Used `CUSTOM_ELEMENTS_SCHEMA` (should not be used with ngx wrappers)
- Imported from `@ui5/webcomponents/dist/*` (raw side) instead of `@ui5/webcomponents-ngx/{main|fiori}`
- Used `[attr.xxx]="..."` for every binding (instead of real `[xxx]="..."` Angular inputs)
- Bound raw DOM event names like `(selection-change)` (instead of the renamed `(ui5SelectionChange)` outputs)
- Invented properties and slots that do not exist

The kit-augmented path produces **clean, idiomatic ngx code** every time, and costs no more on average than the baseline at steady state.

## Why knowledge graphs help LLMs

This section explains the mechanism — why structured library knowledge, injected as system context and exposed as a queryable tool, is more effective than letting the model rely on its training data alone.

### The core problem LLMs face with component libraries

LLMs do not "know" APIs in the same sense a type system does. They generate plausible token sequences based on patterns in their training data. For component libraries this causes four distinct failure modes:

1. **Training cutoff drift.** The model's knowledge is frozen at the training cutoff date. Any library that has shipped new components, renamed APIs, or deprecated features after that date is invisible. The model will confidently generate code against the old API surface.
2. **Rare-API hallucination.** For widely-used libraries the model has seen many examples; for niche or enterprise libraries it has seen few. When the model is asked to use a component it has rarely seen, it does not say "I don't know" — it synthesises an API that looks like neighbouring libraries. This is exactly how we got `show-header-content` on `ui5-dynamic-page` in the baseline: a plausible boolean attribute that does not exist.
3. **Mixed-version training data.** The model sees old and new versions of the same library in its training corpus. When generating, it picks freely from both. UI5 specifically suffers from this — the old pre-v2 `mode="SingleSelect"` syntax on `ui5-list` still appears alongside the newer `selection-mode="Single"` in training data. The model produces a mix.
4. **Framework wrapper invisibility.** This is the failure mode we hit hardest in the experiment. When a library has both a raw custom-element API *and* a framework-specific wrapper with a different API surface (raw `(click)` vs Angular `(ui5Click)`, raw `[attr.design]` vs Angular `[design]`), the model defaults to the rawer, more common pattern. The wrapper exists in training data, but it is outnumbered by examples using the raw custom-element pattern with a schema bypass. The model follows the statistically dominant pattern — which is wrong for the target.

A knowledge graph addresses all four failure modes because it gives the model **ground truth, current, framework-specific data on demand**.

### What a knowledge graph provides that flat documentation does not

You could imagine dumping the library's README into the system prompt as an alternative. That does not work well, for three reasons:

1. **Size.** UI5 has 182 components, 1,212 properties, 286 events, 259 slots, 163 CSS parts, and 1,476 theme variables. A flat text dump of all that is >100 KB of tokens per request, destroying the context budget and cost model.
2. **No structure.** A README cannot answer "list all events that fire on `ui5-list`." The model would have to read the whole document every time and extract what it needs. That is expensive and error-prone.
3. **No queryability.** A flat dump is either fully loaded or not loaded. A graph with a query tool can load **only the subgraph the model needs**, when it needs it. The model decides.

The graph solves these by splitting knowledge into two layers:

- **A compact summary** (~8 KB for UI5) injected into the system prompt on every turn, cached across turns via Anthropic's ephemeral prompt cache. It contains the mandatory usage pattern, the do-not-do list, the events-renamed table, and a roster of available components. It does not contain per-component detail.
- **A queryable graph** (~1.7 MB for UI5) exposed via a `query_kit` tool. The model calls it with questions like `query_kit("ui5-list")`, `query_kit("ui5-button.design")`, `query_kit("ui5-shellbar#searchField")`, `query_kit("theme:button")` and gets back a focused subgraph as formatted text. The full graph never enters the context window — only the relevant slice does.

This two-layer design means the model **always has the pattern rules** (from the summary) and **pays for detail only when it needs detail** (via query_kit). In our experiment the model called `query_kit` 7–14 times per generation — an order of magnitude less than reading the equivalent information from flat docs, and targeted exactly at the components the prompt required.

### Why adding a query tool is different from just reading files

Adorable's existing provider already has `read_file`, `read_files`, `glob`, and `grep` tools. Why not just put the docs in the project and let the model grep them?

Three reasons:

1. **The docs are not in the project.** Library docs live in `node_modules` or on the web. Scanning `node_modules` is wasteful (huge, mostly irrelevant) and the web is unreachable from the agent. A kit sidesteps this by shipping curated data inside Adorable.
2. **File reads return raw text.** The model has to parse it. A graph query returns pre-structured output tailored to the question: "here are the component's slots, here are its Angular inputs with types, here are its renamed outputs, here is a usage example." The model spends tokens on the *answer*, not on the *search*.
3. **File reads do not know the current library version.** A kit is versioned and shipped with Adorable. The model always gets data matching the version documented in the kit, regardless of what is installed in the user's project. (Mismatches are flagged via a `libVersion` check — see the Open Questions section.)

### Why the post-generation rescan is cheap insurance

Even with a perfect summary and a well-used query tool, the model will occasionally slip. The rescan is a deterministic, LLM-free linter that walks the generated files, extracts every `<ui5-*>` tag and its bindings, and checks them against the graph. It runs in under 100 ms per project. When it finds issues, it feeds them back to the model as a single correction turn.

This is essentially a **type check against library ground truth**. Angular's TypeScript compiler already catches some errors, but it cannot see inside custom-element attributes or detect that `[attr.selection-mode]` should be `[selectionMode]` with the ngx wrapper. The rescan catches exactly what the compiler misses.

In our experiments the rescan was never needed (upfront teaching produced zero issues across 5 runs), but it stays in the architecture as a safety net for the long tail of prompts we haven't yet tested.

### Why prompt caching makes this economic

Without caching, injecting an 8 KB summary on every turn would cost ~$0.02 per turn, per request. At scale that adds up. With Anthropic's ephemeral prompt cache, the summary is written to the cache on the first call of a 5-minute window and read at 10% of the normal input rate on all subsequent calls within that window. Any user working actively on a UI5 project sends many prompts within 5 minutes, so most calls hit a warm cache.

Our measurements confirm this: warm-cache kit runs on the easy prompt cost **$0.147** vs baseline **$0.247** — cheaper than baseline. On the hard prompt kit cost $0.221 vs baseline $0.091, so there is a real $0.13/generation overhead in the worst case, but that is the price of zero defects vs 23.

### Summary of the mechanism

| Problem | How the kit system addresses it |
|---|---|
| Training cutoff drift | Kit is versioned and rebuilt when the library ships. Model always gets current APIs. |
| Rare-API hallucination | Graph has ground truth for every component. Model can `query_kit` instead of guessing. |
| Mixed-version training data | Summary explicitly states the version and the mandatory pattern. Old patterns become "forbidden" in the system prompt. |
| Framework wrapper invisibility | Graph joins raw API with the framework wrapper layer. Summary leads with "use the wrapper, not the raw pattern." Rescan catches violations. |
| Context budget | Summary is compact (8 KB) and cached. Graph queries load only the relevant subgraph on demand. |
| Cost overhead | Prompt caching reduces warm-path cost to ~10% of the uncached figure. |
| Residual errors | Post-generation rescan catches what upfront teaching missed, with a one-turn fix-it loop. |

## Scope

This doc covers:

- Schema changes (`Kit`, `ProjectKit`)
- Asset storage under `apps/server/src/assets/kits/`
- New `KitService` (loader, detector, query tool, validator)
- `ContextBuilder` integration for summary injection with prompt caching
- Tool registration for `query_kit`
- Post-generation rescan hook as a safety net
- Desktop DB sync requirements
- UX surface
- Rollout order
- Kit ingestion recipe for future kits

Out of scope for this doc:

- Kit marketplace (future)
- Admin UI for uploading custom kits (future)
- Kits for other libraries (one kit in production first)

## Terminology

- **Kit** — a curated, versioned knowledge graph for one library (e.g. `ui5-ngx` for UI5 Web Components + ngx wrappers).
- **Summary** — a compact markdown file (~8 KB) that the Kit ships. It describes the mandatory usage pattern, anti-patterns, and references. Injected into the system prompt with `cache_control`.
- **Graph** — a larger JSON file (~1.7 MB for UI5) with the full component/slot/property/event/theme variable index. Never injected directly — queried on demand via `query_kit`.
- **query_kit tool** — an LLM tool that accepts a query string (e.g. `"ui5-button"`, `"ui5-list.selectionMode"`, `"theme:button"`) and returns a focused subgraph as formatted text.
- **Rescan / validator** — a post-generation linter that uses the graph as a source of truth to catch pattern violations in the AI's output. Runs once after the main generation turn completes.

## Experimental evidence

The experiment lives at `experiments/ui5-kit-graph/` and contains:

- `build-kit-graph.ts` — joins UI5 CEM files with `@ui5/webcomponents-ngx` wrapper metadata to produce a ngx-aware graph
- `parse-ngx-snapshots.ts` — parses Jest snapshot files from the ngx repo to extract wrapper class names, Angular inputs, and renamed outputs
- `query-kit.ts` — the `query_kit` tool implementation
- `rescan.ts` — the ngx-aware post-generation linter
- `run-comparison.ts` — the test harness (baseline vs cold-kit vs warm-kit, on easy and hard prompts)
- `ui5-kit-graph.json`, `ui5-kit-summary.md`, `ngx-wrappers.json` — generated artifacts

The results folders (`results/`, `results-hard/`) contain the generated files from each run. The pre-fix results (`results-pre-ngx-fix/`, `results-hard-pre-ngx-fix/`) are preserved for comparison — they show what the system looked like before we correctly modelled the ngx wrapper layer.

### Quality metric — "issues" in the rescan

The rescan categorises problems as:

- `unknown_component` — tag with no matching component in the graph
- `unknown_property` — plain or `[prop]` binding to a non-existent property
- `unknown_event` — `(event)` binding to a non-existent event
- `unknown_slot` — `slot="name"` that the parent component does not declare
- `ngx_attr_binding` — `[attr.foo]` used when a real `[foo]` Input exists
- `ngx_raw_event` — raw DOM event name bound when a renamed `(ui5Xxx)` output exists
- `ngx_raw_import` — import from `@ui5/webcomponents/dist/*` instead of the ngx module
- `ngx_missing_import` — component tag used but wrapper class not imported
- `ngx_schema_used` — `CUSTOM_ELEMENTS_SCHEMA` declared

### Cost summary at Sonnet 4.6 pricing (Apr 2026)

Input: $3/MTok · Output: $15/MTok · Cache create: $3.75/MTok · Cache read: $0.30/MTok

**Easy prompt (product list page):**

| Scenario | Total $ | Duration | Issues |
|---|---|---|---|
| Baseline | $0.247 | 137 s | 15 |
| Kit cold (first call) | $0.276 | 108 s | 0 |
| **Kit warm (subsequent)** | **$0.147** | **54 s** | **0** |

Kit-warm is strictly better on every axis.

**Hard prompt (dashboard with fiori components):**

| Scenario | Total $ | Duration | Issues |
|---|---|---|---|
| Baseline | $0.091 | 54 s | 23 |
| Kit cold (first call) | $0.180 | 61 s | 0 |
| **Kit warm (subsequent)** | **$0.221** | 63 s | **0** |

Kit-warm costs ~$0.13 extra per generation to eliminate 23 defects. Still worth it.

### Caveats

- **n = 2 per scenario.** Results are directionally clear but would benefit from more runs in production. The issue count gap (15 vs 0, 23 vs 0) is large enough that I would commit based on what we have.
- **Per-call variance is larger than cache savings at this scale.** The hard-prompt B-warm run happened to take one more turn than B-cold, which pushed its total cost above B-cold. Steady-state production will see cache savings more cleanly because many requests share the same cached prefix.
- **Implicit caching from Anthropic's API** contaminates the "first call" measurement — some runs we marked as B-cold probably hit an implicit cache from previous runs. The cost numbers are slightly optimistic for cold starts.

## How the graph is generated

The ingestion pipeline is **fully deterministic — no LLM is involved in building the graph itself.** Every input is a machine-readable manifest shipped by the library, or a source file we parse with a simple tree-sitter-free regex scan. This keeps the graph reproducible, auditable, and free to regenerate.

For the UI5+ngx kit specifically, the pipeline has four stages, implemented in `experiments/ui5-kit-graph/`:

```
                                       ┌─────────────────────────┐
  Stage 1. CEM ingestion               │  custom-elements.json   │  ~45k lines
  (raw web-component API)              │  main + fiori + base    │
                                       └────────────┬────────────┘
                                                    │
                                                    ▼
                                       ┌─────────────────────────┐
  Stage 2. ngx snapshot parsing        │  Jest snapshot files    │  ~17k lines
  (Angular wrapper layer)              │  from ui5-ngx repo      │
                                       └────────────┬────────────┘
                                                    │
                                                    ▼
                                       ┌─────────────────────────┐
  Stage 3. Horizon theme ingestion     │  parameters-bundle.css  │  ~64 KB
  (CSS variables)                      │  compiled theme bundle  │
                                       └────────────┬────────────┘
                                                    │
                                                    ▼
                                       ┌─────────────────────────┐
  Stage 4. Join + emit                 │  ui5-kit-graph.json     │  1.7 MB
                                       │  ui5-kit-summary.md     │  8.9 KB
                                       └─────────────────────────┘
```

### Stage 1 — CEM ingestion (`build-kit-graph.ts`)

Custom Elements Manifests (CEM) are a **W3C-adjacent standard** for describing web components as structured JSON. Every modern web-component library publishes a `custom-elements.json` alongside its compiled code. UI5 ships three: one each for `@ui5/webcomponents` (main), `@ui5/webcomponents-fiori` (enterprise layout components), and `@ui5/webcomponents-base` (primitives).

Each manifest contains, per component:

- `tagName` (e.g. `ui5-button`)
- `description` — the JSDoc from the source file
- `slots` — named content slots with their own descriptions
- `members` — properties (fields) with types, defaults, privacy, and descriptions
- `events` — DOM event names with descriptions and typed payload references
- `cssParts` — styleable shadow-DOM parts
- `superclass` — for inheritance chains

The ingestion script walks every module declaration in every CEM file and emits graph nodes:

```
nodes:
  component:  comp:ui5-button           → { className, modulePath, description }
  slot:       slot:ui5-button:icon       → { description }
  property:   prop:ui5-button:design     → { type, default, description }
  event:      event:ui5-button:click     → { type, description }
  cssPart:    csspart:ui5-button:button  → { description }
edges:
  comp:ui5-button  —has_slot→      slot:ui5-button:icon
  comp:ui5-button  —has_property→  prop:ui5-button:design
  comp:ui5-button  —fires_event→   event:ui5-button:click
  comp:ui5-button  —has_css_part→  csspart:ui5-button:button
  comp:ui5-button  —in_package→    pkg:@ui5/webcomponents
```

For UI5 2.21 this produces **182 component nodes, 259 slot nodes, 1,212 property nodes, 286 event nodes, and 163 CSS part nodes** with ~2,100 edges between them. All extracted deterministically in ~200 ms from files we didn't write.

### Stage 2 — ngx snapshot parsing (`parse-ngx-snapshots.ts`)

The CEM describes the **raw custom-element API**. But Adorable's target is `@ui5/webcomponents-ngx`, which adds an Angular wrapper layer that renames events and exposes real `@Input()`s. This layer is **not** in the CEM — it exists only in the ngx repository.

Fortunately, ui5-webcomponents-ngx generates its wrappers automatically via a code-generator and commits Jest snapshot tests of the generated output. Those snapshots are ~17k lines of generated Angular component source code, one entry per component, in this format:

```ts
exports[`Snapshot test Main Button should match the snapshot 1`] = `
"import { Component, ... } from '@angular/core';
@ProxyInputs(['design', 'disabled', 'icon', ...])
@ProxyOutputs(['click: ui5Click'])                    // ← the rename map
@Component({
  standalone: true,
  selector: 'ui5-button',
  inputs: ['design', 'disabled', 'icon', ...],         // ← real Angular inputs
  outputs: ['ui5Click'],                                // ← renamed outputs
  exportAs: 'ui5Button',
})
class ButtonComponent { ... }"
`;
```

The parser (`parse-ngx-snapshots.ts`) walks every snapshot entry and extracts:

- `componentClass` — the Angular class name (e.g. `ButtonComponent`)
- `selector` — the tag used in templates (usually matches `tagName` from the CEM, which is our join key)
- `inputs` — the list of real Angular `@Input()` names, already camelCased
- `outputs` — a map from DOM event name to Angular output name (e.g. `{ "click": "ui5Click", "selection-change": "ui5SelectionChange" }`)
- `exportAs` — the template reference name
- `importModule` — derived from which snapshot file contained it (`main` → `@ui5/webcomponents-ngx/main`, `fiori` → `@ui5/webcomponents-ngx/fiori`)

This produces a `ngx-wrappers.json` file keyed by tag name:

```json
{
  "ui5-button": {
    "componentClass": "ButtonComponent",
    "importModule": "@ui5/webcomponents-ngx/main",
    "exportAs": "ui5Button",
    "inputs": ["design", "disabled", "icon", "endIcon", ...],
    "outputs": { "click": "ui5Click" },
    "outputNames": ["ui5Click"]
  },
  "ui5-list": {
    "componentClass": "ListComponent",
    "importModule": "@ui5/webcomponents-ngx/main",
    "inputs": ["headerText", "selectionMode", "growing", ...],
    "outputs": {
      "item-click": "ui5ItemClick",
      "selection-change": "ui5SelectionChange",
      "load-more": "ui5LoadMore",
      ...
    },
    ...
  }
}
```

For UI5+ngx this covers **159 of 182 components** — the gap is internal/private components that don't have Angular wrappers. Those components don't get an `ngx` block on their graph node and `query_kit` will warn that they're not recommended.

**Why this stage is crucial:** without the ngx layer, the kit would teach the model the raw custom-element pattern (which is what the earlier version of the experiment did — see `results-pre-ngx-fix/`). The entire value of the kit comes from correctly modelling the framework-specific API surface, not just the raw one.

### Stage 3 — Horizon theme ingestion (`build-kit-graph.ts`)

UI5's Horizon theme is distributed as a compiled JavaScript file containing a `:root { --sapBrandColor: ...; --sapButton_Background: ...; ... }` template literal. The ingestion script reads this file and extracts every `--sap*` CSS variable with a simple regex:

```
/(--sap[A-Za-z0-9_]+)\s*:\s*([^;]+);/g
```

Each variable becomes a `themeVariable` node with:

- `label` — the full variable name (e.g. `--sapButton_Background`)
- `value` — the resolved value for the Horizon theme (e.g. `#fff`)
- `category` — derived from the prefix after `--sap` and before the first underscore (e.g. `Button`, `List`, `Shell`, `Chart`)

For Horizon this produces **1,476 theme variables across ~30 categories**. The variables are connected to their theme node via `theme_contains` edges, and to components via a heuristic `themed_by` edge (component class name matches variable category). The heuristic is imperfect (e.g. `ui5-shellbar`'s class is `ShellBar` but the variables are `--sapShell_*`) — an area for future improvement — but it provides useful "which variables apply to this component" hints for `query_kit`.

### Stage 4 — Join and emit

The final stage of `build-kit-graph.ts` joins the ngx wrapper data onto the component nodes, writes the complete graph to `ui5-kit-graph.json`, and generates the human-readable `ui5-kit-summary.md` from the in-memory model.

The **graph JSON** is the machine format. It's consumed only by the `query_kit` tool at runtime — never injected directly into the LLM context. Its structure is a flat list of nodes and a flat list of edges:

```json
{
  "meta": { "ui5Version": "2.21.0", "componentCount": 182, "themeVarCount": 1476 },
  "nodes": [
    {
      "id": "comp:ui5-button",
      "kind": "component",
      "label": "ui5-button",
      "package": "@ui5/webcomponents",
      "description": "...",
      "data": {
        "className": "Button",
        "modulePath": "dist/Button.js",
        "ngx": {
          "componentClass": "ButtonComponent",
          "importModule": "@ui5/webcomponents-ngx/main",
          "inputs": [...],
          "outputs": { "click": "ui5Click" }
        }
      }
    },
    { "id": "slot:ui5-button:icon", "kind": "slot", ... },
    { "id": "prop:ui5-button:design", "kind": "property", ... },
    { "id": "event:ui5-button:click", "kind": "event", "data": { "ngxName": "ui5Click" } },
    ...
  ],
  "edges": [
    { "from": "comp:ui5-button", "to": "slot:ui5-button:icon", "kind": "has_slot" },
    { "from": "comp:ui5-button", "to": "prop:ui5-button:design", "kind": "has_property" },
    ...
  ]
}
```

The **summary markdown** is the human-readable and LLM-readable format. It is generated from the same in-memory graph and contains:

1. A mandatory usage-pattern section with a full correct example
2. A do-not-do list enumerating the anti-patterns (`CUSTOM_ELEMENTS_SCHEMA`, `[attr.*]`, raw event names, raw dist imports, kebab-case bindings)
3. An events-renamed reference table showing the most common `domName → ui5Xxx` mappings
4. The theme section (how to `setTheme`, list of top theme-variable categories)
5. A god-node list (highest-degree components, useful as composition anchors)
6. A component index by package (mainly for recognition — the model already knows most UI5 component names)
7. A pointer to `query_kit` for details

The summary is **deliberately kept under 10 KB**. Longer summaries crowd out actual task context and are more expensive even with caching.

### Total ingestion runtime and cost

For the UI5+ngx kit:

- Total runtime: **~3 seconds** end-to-end, no network
- Total cost: **zero** — no LLM calls, no API usage, no paid services
- Reproducibility: **fully deterministic** — same inputs produce byte-identical outputs
- Update cadence: run on demand when UI5 ships a new version (proposed: weekly scheduled CI)

This cheap and deterministic ingestion is a direct consequence of UI5 (and web components broadly) publishing structured metadata. For libraries that don't publish CEMs or equivalent manifests, the ingestion would require either parsing `.d.ts` files (doable with `ts-morph`, also deterministic) or, as a last resort, a one-time LLM pass over source code to extract component signatures. That one-time extraction cost then amortises across every future generation that uses the kit.

### Detector implementation (for the post-gen rescan)

The same graph is used by the rescan detector (`rescan.ts` in the experiment, ported to `kit.service.ts` in production). The detector walks the generated `.ts` and `.html` files with a small stateful tokenizer that:

1. Matches every `<ui5-xxx>` opening tag
2. Maintains a parent-tag stack for slot validation
3. Extracts attributes in three forms: `plain-attr="..."`, `[prop]="..."` / `[attr.prop]="..."`, and `(event)="..."`
4. Also extracts bare boolean attributes like `show-header-content` (no `=` follows)
5. For each attribute, validates it against the graph:
   - Plain attr or `[prop]` → must be a camelCased Angular input OR a CEM property
   - `[attr.prop]` → if the corresponding camelCased Angular input exists, flag as `ngx_attr_binding` (should use the real input)
   - `(event)` → must be a renamed ngx output (`ui5Xxx`), or a raw DOM event only if no ngx wrapper exists for this tag
   - `slot="name"` → parent tag must declare that slot in the graph
6. File-level scans for:
   - `CUSTOM_ELEMENTS_SCHEMA` declaration
   - Imports from `@ui5/webcomponents/dist/*` (raw side)
   - Used component tags with no matching wrapper class import

Each finding carries a fix suggestion (e.g. "use `[selectionMode]` instead of `[attr.selection-mode]`"), which is fed back to the model if the rescan-fix hook runs.

The entire detector is **~300 lines of TypeScript with no external dependencies beyond `fs` and the graph JSON**. It runs in a few milliseconds per file.

## Architecture

### End-to-end data flow

Before diving into components, this is what happens from the moment a user sends a prompt to the moment Adorable returns generated code:

```
 ┌─────────┐                                                     ┌─────────┐
 │ Client  │                                                     │ Server  │
 └────┬────┘                                                     └────┬────┘
      │                                                               │
      │  1. User opens project                                        │
      ├──────────────────────────────────────────────────────────────▶│
      │                                                               │
      │                          ┌─────────────────────────┐          │
      │                          │   KitService.detect     │          │
      │                          │   - reads package.json  │          │
      │                          │   - matches Kit rows    │          │
      │                          │   - loads graph+summary │          │
      │                          └───────────┬─────────────┘          │
      │                                      │                        │
      │◀── project state incl. attached kits ┘                        │
      │                                                               │
      │  2. User sends prompt ("build a product list page...")        │
      ├──────────────────────────────────────────────────────────────▶│
      │                                                               │
      │             ┌──────────────────────────────────────┐          │
      │             │          ContextBuilder              │          │
      │             │  system prompt = [                   │          │
      │             │    BASE,                              │          │
      │             │    ANGULAR_KB,                        │          │
      │             │    { kit.summaryMd, cache_ephemeral } │          │
      │             │  ]                                    │          │
      │             │  tools = [...FS_TOOLS, query_kit]     │          │
      │             └──────────────┬───────────────────────┘          │
      │                            │                                  │
      │                            ▼                                  │
      │             ┌──────────────────────────────────────┐          │
      │             │        BaseLLMProvider.loop          │          │
      │             │                                      │          │
      │             │   turn 1: model reads kit summary    │          │
      │             │           from cached prefix         │          │
      │             │           calls query_kit("ui5-list")│          │
      │             │                ↓                     │          │
      │             │   turn 2: receives subgraph,         │          │
      │             │           calls query_kit(...)×N     │          │
      │             │                ↓                     │          │
      │             │   turn 3: writes files with          │          │
      │             │           correct ngx pattern        │          │
      │             │                ↓                     │          │
      │             │   POST-GEN: KitService.validate      │          │
      │             │             over written files       │          │
      │             │                ↓                     │          │
      │             │   (if findings > 0 and               │          │
      │             │    attempts < MAX_FIX_ATTEMPTS)      │          │
      │             │   turn 4: fix-it turn with           │          │
      │             │           findings as input          │          │
      │             └──────────────┬───────────────────────┘          │
      │                            │                                  │
      │◀── SSE stream:  file_written, tool_call, stream, status ─────│
      │                                                               │
```

The flow maps directly to existing Adorable abstractions — nothing here is fundamentally new plumbing. The changes are:

- **`ContextBuilder`** now composes the system prompt as a content-block array (instead of a plain string) when kits are attached, so individual blocks can carry `cache_control` markers.
- **`BaseLLMProvider`** gets one new capability: after the main agentic loop completes, it calls `kitService.validateKitUsage()` and optionally runs one more turn with the findings.
- **`ToolExecutor`** handles one new tool (`query_kit`) by delegating to `KitService.queryKit()`.
- **`ProjectService`** (or a provider-level hook) attaches kits when a project is opened.

Everything else — the streaming protocol, the file-system abstraction, the tool batching — stays unchanged.

### Data model — new Prisma models

```prisma
model Kit {
  id             String   @id @default(cuid())
  name           String   @unique            // e.g. "ui5-ngx"
  displayName    String                       // e.g. "UI5 Web Components (Angular)"
  packageNames   String                       // JSON array — npm deps that trigger auto-attach
  version        String                       // kit version (independent from lib version)
  libVersion     String                       // e.g. "@ui5/webcomponents@2.21.0"
  summaryPath    String                       // relative path under assets/kits/{name}/
  graphPath      String                       // relative path under assets/kits/{name}/
  enabledByDefault Boolean @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  projectKits    ProjectKit[]
}

model ProjectKit {
  id        String  @id @default(cuid())
  projectId String
  kitId     String
  enabled   Boolean @default(true)
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  kit       Kit     @relation(fields: [kitId], references: [id])
  createdAt DateTime @default(now())
  @@unique([projectId, kitId])
}
```

Add relation to `Project`:

```prisma
model Project {
  // ...
  kits  ProjectKit[]
}
```

**Desktop DB sync (required per CLAUDE.md):** `apps/desktop/db-init.ts` must be updated:
1. Add `Kit` and `ProjectKit` tables to `createFreshSchema()`
2. Add a new migration entry for existing installations
3. Bump `LATEST_VERSION`

### Asset layout

```
apps/server/src/assets/kits/
└── ui5-ngx/
    ├── manifest.json           # { name, displayName, version, libVersion, packageNames[] }
    ├── summary.md              # ~8 KB — the system-prompt addendum
    ├── graph.json              # ~1.7 MB — the full queryable graph
    └── ingestion/              # optional — scripts for rebuilding the kit
        ├── build-kit-graph.ts
        ├── parse-ngx-snapshots.ts
        ├── query-kit.ts        # shared with runtime — same file
        ├── rescan.ts           # shared with runtime — same file
        └── README.md           # how to update this kit for a new library version
```

The ingestion scripts are kept inside the kit directory (not in a shared tools folder) so that each kit can have its own ingestion approach — some will use CEM files, others `.d.ts` parsing, others `metadata.json`, etc.

### Seed script

`apps/server/src/scripts/seed-kits.ts` runs on server startup. For each directory under `assets/kits/`, reads `manifest.json` and upserts a `Kit` row. Idempotent — re-running does not duplicate.

### New service — `KitService`

`apps/server/src/services/kit.service.ts`

```ts
interface LoadedKit {
  name: string;
  displayName: string;
  summaryMd: string;         // loaded once, cached
  graph: KitGraph;           // loaded once, cached
  version: string;
  libVersion: string;
  packageNames: string[];
}

export class KitService {
  private loaded = new Map<string, LoadedKit>();

  async loadKit(name: string): Promise<LoadedKit | null>;

  async detectKitsForProject(projectId: string): Promise<LoadedKit[]> {
    // 1. Check ProjectKit table — user overrides win
    // 2. For any kit not explicitly disabled, check the project's
    //    package.json against kit.packageNames
    // 3. Return the LoadedKit list for matching kits
  }

  queryKit(kitName: string, query: string): string {
    // Port of experiments/ui5-kit-graph/query-kit.ts (queryKit fn)
  }

  validateKitUsage(kitName: string, files: Map<string, string>): Finding[] {
    // Port of experiments/ui5-kit-graph/rescan.ts (analyzeFile fn)
  }
}
```

**Porting strategy:** copy the experiment files into `apps/server/src/services/kit/` with minimal modifications. The interfaces already match; the only change is how files are loaded (from the Kit asset directory via `fs.readFile`, not hardcoded paths).

### ContextBuilder integration

`apps/server/src/providers/context-builder.ts` — `prepareAgentContext`:

```ts
// existing logic...

const projectKits = await kitService.detectKitsForProject(projectId);

// Build system prompt as array of content blocks so individual pieces can
// be marked with cache_control.
const systemBlocks: Array<{ type: 'text', text: string, cache_control?: {...} }> = [
  { type: 'text', text: BASE_SYSTEM_PROMPT },
  { type: 'text', text: ANGULAR_KNOWLEDGE_BASE },
];

for (const kit of projectKits) {
  systemBlocks.push({
    type: 'text',
    text: kit.summaryMd,
    cache_control: { type: 'ephemeral' },
  });
}
```

Adorable already has provider-specific logic for structured system prompts; the Anthropic and Gemini providers will need minor adjustments to pass the structured array through. Experiment code confirms the Anthropic SDK accepts this shape directly.

### Tool registration

`apps/server/src/providers/tools.ts` — add:

```ts
export const QUERY_KIT_TOOL = {
  name: 'query_kit',
  description:
    'Query a library knowledge graph for accurate component API info. ' +
    'Available kits for this project: {{KITS}}. ' +
    'Query syntax: "<tag-name>" full dump, "<tag-name>.propName" property detail, ' +
    '"<tag-name>@event-name" event detail, "<tag-name>#slot-name" slot detail, ' +
    '"theme:category" or "theme:--var-name". Call this BEFORE guessing any ' +
    'component API for a library listed in the available kits.',
  input_schema: {
    type: 'object',
    properties: {
      kit: { type: 'string', description: 'Kit name (e.g. "ui5-ngx")' },
      query: { type: 'string', description: 'Query string per the syntax in the description' },
    },
    required: ['kit', 'query'],
  },
};
```

`BaseLLMProvider.buildToolList()` appends `QUERY_KIT_TOOL` when `projectKits.length > 0`, with the description's `{{KITS}}` placeholder substituted for the actual list of attached kit names.

`apps/server/src/providers/tool-executor.ts` — handle the new tool name:

```ts
case 'query_kit': {
  const { kit, query } = args;
  return kitService.queryKit(kit, query);
}
```

### Post-generation rescan hook

`apps/server/src/providers/base.ts` — after the main agentic loop completes:

```ts
if (projectKits.length > 0) {
  const allFindings: Finding[] = [];
  for (const kit of projectKits) {
    allFindings.push(...kitService.validateKitUsage(kit.name, writtenFiles));
  }

  if (allFindings.length > 0 && rescanFixAttempts < MAX_RESCAN_FIX_ATTEMPTS) {
    rescanFixAttempts++;
    messages.push({
      role: 'user',
      content: [{
        type: 'text',
        text: `The kit validator found ${allFindings.length} issues in the code ` +
              `you just wrote. Please fix them:\n\n${formatFindings(allFindings)}`
      }],
    });
    continue; // one more generation turn
  }

  if (allFindings.length > 0) {
    logger.warn(`Kit validator issues remain after ${rescanFixAttempts} attempts`, { findings: allFindings });
  }
}
```

**Safety cap:** `MAX_RESCAN_FIX_ATTEMPTS = 1` initially. Do not enter an infinite fix-it loop. If issues remain after one correction turn, log them and return the best-effort result.

This is the **safety net**, not the primary mechanism. The primary mechanism is upfront teaching via the summary + `query_kit`. In our experiments, upfront teaching produced zero issues across 5/5 runs, so the rescan would rarely fire.

## UX

Minimal, non-intrusive:

1. **Auto-detection.** When a project's `package.json` matches a kit's `packageNames`, the kit is automatically attached on project open. No user action required.
2. **Project settings — Kits section.** Lists attached kits with enable/disable toggles. Maps to `ProjectKit.enabled`. Users can disable a kit if they want raw LLM behavior.
3. **Visual indicator.** Small badge or subtitle near the AI input area: *"UI5 kit active"* when a kit is loaded. Tells users the AI is tuned for their stack.
4. **Skill integration (stretch).** Existing skills like `frontend-design` could check for attached kits and reference them in their own prompts.

## Rollout order

Ship in this order to reduce risk:

1. **Schema + seed + asset storage.** No runtime behavior change. Merge and land migration. Ship the UI5 kit as a bundled asset and register it in the DB. Verify desktop sync.
2. **`KitService` + `query_kit` tool + `ContextBuilder` injection** behind a per-project feature flag (`ProjectKit.enabled = false` by default initially).
3. **Enable for internal test projects** (your own + 1–2 friendly external users). Gather data on token cost and user feedback.
4. **Post-generation rescan hook.** Add after `query_kit` is stable. Start with `MAX_RESCAN_FIX_ATTEMPTS = 1`.
5. **Default-on for new projects** that match package detection. Existing projects stay off unless users opt in.
6. **Project settings UI** for kit toggle control.
7. **Second kit** — pick the next most-requested library (Material, PrimeNG, shadcn-ng, internal design systems) and build using the same pipeline.

**Estimated first-kit integration cost:** 2–4 focused days. Most of that is schema + service plumbing + desktop DB sync. The experiment code ports mostly as-is.

## Kit ingestion recipe

Each kit follows this pattern:

1. **Find the source of structured truth.** For UI5 it was `custom-elements.json` (CEM). For other libraries:
   - Angular Material: `node_modules/@angular/material/package.json` + `.d.ts` files
   - PrimeNG: `component.json` files per component
   - shadcn-ng: source `.ts` files (parse with `ts-morph`)
   - Internal design systems: whatever is available (usually `.d.ts` + stories)
2. **Find the framework-binding layer** if it differs from the raw API. For UI5 this was the `@ui5/webcomponents-ngx` wrapper — a completely separate API surface from the raw custom elements. Catching this gap was the single most important discovery in the experiment.
3. **Parse both. Join on tag/selector.** Emit a graph with nodes for components, slots, properties, events, CSS parts, theme variables, and framework-specific wrappers. Emit a compact summary markdown for system-prompt injection.
4. **Write a kit-specific detector** that catches the wrong-pattern trap for that library. For UI5+ngx the traps were `CUSTOM_ELEMENTS_SCHEMA`, `[attr.*]`, raw DOM event names, and raw dist imports. Other kits will have different traps.
5. **Write a test prompt + measure.** Use a harness like `experiments/ui5-kit-graph/run-comparison.ts`. Expect: baseline high-issue-count, kit zero-issue-count, cost delta within a ~$0.10 band.

## Open questions

1. **Cross-kit dependencies.** If a user has both `@ui5/webcomponents-ngx` and a charts library, do we attach both kits? How do their summaries compose? — *Proposal:* attach all matching kits, concatenate summaries with clear separators. Cap total system-prompt kit content at 20 KB to bound cost.
2. **Kit versioning / lib version drift.** When a user's project uses UI5 2.19 but the kit was built from UI5 2.21, how big a problem is that? — *Proposal:* store `libVersion` on the Kit and warn (not block) when the project's resolved version differs by a minor version. Require kits to be rebuilt on major lib versions.
3. **Kit source of truth for updates.** Who rebuilds the UI5 kit when UI5 ships a new version? — *Proposal:* a scheduled GitHub Action runs `npm install @ui5/webcomponents@latest && npx tsx build-kit-graph.ts` weekly and opens a PR with the new graph + summary.
4. **Non-Angular kits.** The pilot is Angular-specific because Adorable generates Angular. What happens when Adorable supports other frameworks? — *Proposal:* kits are framework-specific. A `react-material` kit and an `angular-material` kit are separate entries. `Kit.framework` column as a future addition.
5. **User-uploaded kits.** Enterprise customers will want to upload kits for their internal design systems. — *Out of scope for pilot. Revisit after first kit ships.*

## Files likely to change

- `prisma/schema.prisma` — add `Kit`, `ProjectKit`
- `prisma/migrations/` — new migration
- `apps/desktop/db-init.ts` — schema + migration entry + version bump
- `apps/server/src/assets/kits/ui5-ngx/` — new directory with manifest, summary, graph, ingestion scripts
- `apps/server/src/scripts/seed-kits.ts` — new, runs on startup
- `apps/server/src/services/kit/` — new, ported from experiment
  - `kit.service.ts`
  - `query-kit.ts`
  - `rescan.ts`
  - `types.ts`
- `apps/server/src/providers/context-builder.ts` — kit summary injection with cache_control
- `apps/server/src/providers/tools.ts` — `QUERY_KIT_TOOL` definition
- `apps/server/src/providers/tool-executor.ts` — `query_kit` case
- `apps/server/src/providers/base.ts` — optional post-gen rescan hook (step 4)
- `apps/client/src/app/features/editor/settings/` — project settings UI (step 6)

## References

- Experiment: `experiments/ui5-kit-graph/`
- Initial results (with correct CEM+ngx ingestion): `experiments/ui5-kit-graph/results/report.md`, `results-hard/report.md`
- Pre-fix results (CEM only, wrong for ngx target — kept for comparison): `experiments/ui5-kit-graph/results-pre-ngx-fix/`, `results-hard-pre-ngx-fix/`
- Upstream ngx wrapper source: `~/workspace/ui5/ui5-webcomponents-ngx/libs/ui5-angular/__snapshots__/`
- UI5 CEM files: `experiments/ui5-kit-graph/node_modules/@ui5/webcomponents*/dist/custom-elements.json`
