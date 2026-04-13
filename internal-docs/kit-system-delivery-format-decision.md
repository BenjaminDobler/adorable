# Kit System — Delivery Format Decision

**Date:** 2026-04-13
**Status:** Decided — **Option B** selected for Ship 1
**Context:** How the library-knowledge-graph data (built from CEM + ngx snapshots + Horizon theme) gets delivered to the LLM at runtime

## Background

The ingestion pipeline that generates the UI5+ngx knowledge graph is validated and complete (`experiments/ui5-kit-graph/`). It produces a 3,582-node / 4,061-edge graph with 182 components, 1,212 properties, 286 events, 259 slots, 163 CSS parts, and 1,476 Horizon theme variables — each component annotated with its `@ui5/webcomponents-ngx` Angular wrapper metadata (class name, import module, real `@Input()` list, and renamed `@Output()` mapping).

The graph is the **source of truth**. The decision below is about how the LLM accesses this data at runtime, not about whether the data exists or how it's produced.

Additionally, Adorable already has a mature kit infrastructure in production:

- `Kit` Prisma model with `systemPrompt`, `resources`, `designTokens`, `npmPackages`, `mcpServerIds`, `lessonsEnabled`
- `kitService` in `apps/server/src/services/kit.service.ts` — full CRUD, global/team/user ownership, seed logic
- `StorybookComponent` type with `selector`, `inputs`, `outputs`, `template`, `examples`, `description`
- `.adorable/components/*.md` file convention — per-component documentation files that the AI is instructed to `read_files` before writing code
- `KitLesson` system with `save_lesson` tool and automatic injection of learned patterns
- `context-builder.ts` already injects `kit.systemPrompt` and component-doc instructions into the user message

This existing infrastructure influenced the options and the final decision.

## Options evaluated

### Option A — Graph + dedicated `query_kit` tool

**How it works:**
- Ship `graph.json` as a runtime artifact under `apps/server/src/assets/kits/ui5-ngx/`
- Register a new `query_kit` tool in `providers/tools.ts` and `providers/tool-executor.ts`
- The tool loads the graph into memory, accepts structured queries (`"ui5-list"`, `"ui5-button.design"`, `"theme:button"`, etc.), and returns a focused text rendering of the relevant subgraph
- The kit's `systemPrompt` is injected into the system prompt with a pointer to `query_kit`
- No per-component markdown files — the graph is the only data source

**Pros:**
- Cheapest per-query token cost — the LLM gets exactly the subgraph it asks for, nothing more
- Most flexible query syntax — supports property lookup, event lookup, slot lookup, theme-category queries, fuzzy search
- Clean separation: graph is the single source of truth at runtime too
- Scales well to very large libraries (hundreds of components) — only loads what's needed

**Cons:**
- Requires new runtime code paths: tool registration, tool executor case, graph loader, query parser
- Does not reuse the existing `.adorable/components/*.md` + `read_files` workflow that's already proven in production
- Does not compose with the existing `KitLesson` system as naturally — lessons are tied to the Kit entity, not the tool
- Requires more testing surface (new tool = new failure mode)
- ~1-2 days to implement

**When to prefer this:**
- Libraries with very large component counts (200+) where reading full docs would be expensive
- Use cases where the LLM needs to answer cross-cutting questions ("which components fire `selection-change`?", "find me a list-like component")
- If measurements show that per-component markdown files waste significant tokens

### Option B — Per-component markdown files via existing infrastructure (SELECTED)

**How it works:**
- The ingestion pipeline renders each component from the graph into a standalone markdown file (e.g., `components/ui5-list.md`) containing: Angular wrapper class, import module, `@Input()` list with types, renamed `@Output()` table, slots, CSS parts, related theme variables, and a template example
- These files are placed in `apps/server/src/assets/kits/ui5-ngx/components/`
- A `components/README.md` index file lists all components with one-line descriptions
- The kit's `systemPrompt` contains the mandatory-pattern summary (do/don't rules, events-renamed table, module mapping)
- At runtime, the existing kit injection in `context-builder.ts` instructs the AI to `read_files` the component docs before writing code — same workflow as Storybook-sourced kits
- `graph.json` is still shipped as an asset (needed by Ship 2 rescan and available for a future `query_kit` tool)

**Pros:**
- Zero new runtime code — plugs into the existing `.adorable/components/*.md` + `read_files` flow
- Composes with existing `save_lesson` system out of the box
- Already proven in production with other kits
- Smallest possible Ship 1 — ~4 hours, ~3 files changed + asset directory
- No new tools, no new services, no new Prisma models, no schema migrations, no desktop db-init sync
- Lowest risk to existing code
- `graph.json` is still shipped — can add `query_kit` tool later without rebuilding assets

**Cons:**
- Slightly more tokens per lookup — `read_files("components/ui5-list.md")` loads the full component doc (~100-200 lines) even if the LLM only needs one property
- Cannot answer cross-cutting queries ("which components have a `selection-change` event?") — the LLM would have to read many files to answer that, or rely on the README index
- One file per component means ~159 files in the assets directory — manageable but not tiny
- If a component has 20+ inputs and 10+ events, its doc file gets long (~300-400 lines), which is token-heavy if the LLM only needs one field

**When to prefer this:**
- When an existing proven mechanism covers the use case well
- When minimizing new code paths and risk is the priority
- When the LLM's primary need is "look up one component's full API before writing code" rather than "answer cross-cutting graph queries"

### Option C — Both: markdown files + `query_kit` tool

**How it works:**
- Ship both `graph.json` AND per-component `.md` files
- Register `query_kit` as a tool alongside the existing `read_files` workflow
- The `systemPrompt` points the LLM to both: "Use `query_kit` for quick lookups, `read_files` on `.adorable/components/` for full docs"
- The LLM picks whichever mechanism suits the moment

**Pros:**
- Best of both: existing pattern works for full-component reads, dedicated tool works for focused queries
- Graceful degradation — if `query_kit` has a bug, the markdown files still work
- Same codebase serves both interfaces from the same underlying graph

**Cons:**
- Two code paths doing similar things — maintenance overhead, potential confusion for the LLM about which to use
- Larger system prompt (needs to explain both mechanisms)
- Risk that the LLM redundantly uses both (reads the file AND queries the tool for the same component)
- More total implementation work (~2 days, vs ~4 hours for B alone)

**When to prefer this:**
- After Option B is shipped and measurements show specific queries where `read_files` is wasteful
- Never as a Ship 1 — always as an incremental addition to a working B

## Decision

**Option B for Ship 1.** Reasons:

1. **Minimum viable change.** The existing kit infrastructure handles 90% of what the plan proposed. The remaining 10% (ngx-aware content, mandatory-pattern summary) can be delivered through existing fields (`systemPrompt`) and existing conventions (`.adorable/components/*.md`).

2. **Proven mechanism.** The `.adorable/components/` + `read_files` pattern is already in production with Storybook-sourced kits. Adding a new kit that follows this pattern is adding data, not adding plumbing.

3. **The graph is still shipped.** `graph.json` lands in the assets directory for Ship 2 (post-gen rescan) and a potential future Ship 3 (`query_kit` tool). We lose nothing by rendering markdown now and adding a tool later.

4. **Zero schema risk.** No Prisma migrations, no desktop db-init changes, no new Prisma models. The riskiest changes in the original plan are completely eliminated.

5. **Fast to validate.** ~4 hours to first testable output. We can re-evaluate the delivery format after seeing real user behavior with the kit.

## Migration path from B to A or C

If measurements after Ship 1 show that:
- Token cost per `read_files` lookup is too high (>500 tokens wasted per lookup on average), OR
- The LLM frequently needs cross-cutting queries that the markdown files can't serve efficiently, OR
- A future library kit has 500+ components where per-file rendering becomes impractical

Then we add `query_kit` as an **incremental enhancement** (Option C). The steps would be:

1. The `graph.json` is already shipped — no change to the ingestion pipeline.
2. Port `experiments/ui5-kit-graph/query-kit.ts` into `apps/server/src/services/kit/query-kit.ts` (~200 lines, already written and tested).
3. Register `query_kit` in `providers/tools.ts` and add a case in `providers/tool-executor.ts`.
4. Update the kit's `systemPrompt` to reference `query_kit` alongside `read_files`.
5. The markdown files stay in place — they're still useful for full-component reads and as a reference for the `save_lesson` system.

Estimated time for the B→C migration: ~4 hours on top of Ship 1.

## Ship sequence (confirmed)

| Ship | Scope | Estimated time | Depends on |
|---|---|---|---|
| **Ship 1** | UI5+ngx kit as global kit: graph.json + components/*.md + systemPrompt + seedGlobalKits | ~4 hours | Nothing |
| **Ship 2** | Post-gen rescan hook: loads graph.json, validates generated files, optional fix-it turn | ~1 day | Ship 1 |
| **Ship 3** | `query_kit` tool (optional): load graph.json, register tool, update systemPrompt | ~4 hours | Ship 1 |

## Files reference

- Ingestion pipeline (experiment): `experiments/ui5-kit-graph/`
- Generated graph: `experiments/ui5-kit-graph/ui5-kit-graph.json` (1.7 MB)
- Generated summary: `experiments/ui5-kit-graph/ui5-kit-summary.md` (8.9 KB, to be adapted for `systemPrompt`)
- ngx wrappers: `experiments/ui5-kit-graph/ngx-wrappers.json` (159 wrappers)
- Existing kit infrastructure: `apps/server/src/services/kit.service.ts`, `apps/server/src/providers/kits/`
- Existing context injection: `apps/server/src/providers/context-builder.ts` (lines 280-341)
- Companion plans: `internal-docs/kit-system-library-knowledge-graphs.md`, `internal-docs/workspace-knowledge-graphs.md`
