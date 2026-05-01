# Refactor Backlog

A running list of refactor / hardening work for the Adorable codebase. Items
are grouped by theme; each one has enough context that it can be picked up
cold without needing to re-derive the rationale.

This backlog was seeded by a code review on 2026-04-30 (three parallel
exploration passes covering server, client, and cross-cutting concerns) and
by the implementation work in the 2026-04-30 / 2026-05-01 session that
landed 18 focused commits. Items marked **Done** below were completed in
that session; everything else is open.

Conventions for new entries:
- **Why:** the load-bearing reason, not just "it's nicer."
- **Where:** specific file paths + line ranges where helpful.
- **Size:** **S** (under an hour), **M** (a focused PR session), **L**
  (multi-day project that benefits from end-to-end smoke testing).
- **Blocks / Blocked by:** dependency arrows so the order is clear.

---

## ✅ Done — 2026-04-30 / 2026-05-01 session

### Anthropic API + SDK
- Migrated to adaptive thinking + `output_config.effort`; default model
  `claude-sonnet-4-6`; web search bumped to `web_search_20260209`. SDK
  upgraded `0.78 → 0.91`. Opus 4.7 added to the model picker; SAP map
  preserves date-suffixed legacy keys for back-compat. (`2289ba0`)

### Server architecture
- `parseUserSettings()` helper centralizes 18 ad-hoc `JSON.parse(user.settings)`
  call sites; `DebugLogger` gained `info/warn/error` methods that echo to
  console and append to the JSONL trace. (`fbf7205`)
- Startup config validation refuses to boot in production with insecure
  fallback `JWT_SECRET` / `ENCRYPTION_KEY`; desktop now persists a
  `.encryption-key` file with backward-compat seeding for upgrades.
  (`6c996c4`)
- `LLMProvider.streamGenerate` returns a typed `GenerationResult`; the
  `__killChild` Promise-decoration hack replaced by an `onKillRegister`
  callback on `StreamCallbacks`. (`01b454f`, `696440b`)
- Tool-input required-field validation centralized in `executeToolByName`;
  per-tool `validateToolArgs` boilerplate dropped from 11 tool files.
  (`d100a75`, `e53b022`)
- Shared agent-loop strings + history normalization extracted into
  `agent-loop-messages.ts` so anthropic.ts and gemini.ts can't drift on
  the plan-prompt / build-fail / turn-budget wording. (`a9ad9b8`,
  `8a718d9`)

### Database
- FK indexes added on every queryable foreign-key column (`Project.userId`,
  `ChatMessage.projectId`, `TeamMember.userId`, `Kit.userId`/`teamId`,
  `KitLesson.kitId`/`userId`, etc.) — mirrored into desktop's
  `db-init.ts` (migration v13). (`42ee57a`)
- Desktop `createFreshSchema` is now auto-generated from
  `prisma/schema.prisma` via `prisma migrate diff`. New scripts
  `npm run db:generate-fresh-schema` (regenerate) and
  `db:check-fresh-schema` (CI gate). The migrations array stays
  hand-written. (`b6da8c5`)

### Client architecture
- `ProjectService` decomposed: extracted `ChatHistoryStore`,
  `KitManagementStore`, `FigmaImportsStore`, `ProjectExportService`, and
  pure `binary-file.utils.ts` helpers. ProjectService kept thin getters
  / wrappers so every existing consumer (chat, workspace, versions panel,
  insights panel, project settings, visual editor) keeps working
  untouched. Net: 957 → 730 lines. (`d5e95d4`, `58f3eda`, `ad9d816`,
  `cde5e13`)
- `ProjectService.reloadPreview` (250 lines) split into named private
  methods: `tryFastReconnect`, `tryFastRemount`, `bootExternalProject`,
  `bootStandardProject`. (`ae684b1`)
- `ChatComponent` pure helpers (`scopeFilesToSelectedApp`,
  `extractImageAssets`, `simplifyFigmaContext`) moved to
  `chat-tree-helpers.ts`. (`314ed41`)
- Manual `Subscription | null` tracking in `ChatComponent` and
  `VersionsPanelComponent` replaced with `Subject<void>` + `takeUntil()`;
  the chat-stream subscription gained the previously-missing
  `takeUntilDestroyed()` (real leak fix). (`2788938`)

---

## Open — Architectural refactors (Large)

These need their own dedicated session and ideally end-to-end smoke
testing before merge — they touch hot paths.

### Extract `ChatGenerationStreamService`

**Why:** `chat.component.ts:generate()` is 360 lines and the heart of the
chat UX. It mixes signal mutations, SSE event handling, progressive
rendering, cancellation, and chat history updates. Extracting the stream
orchestration into a service makes the component a thin UI layer and lets
us test the stream logic in isolation.

**Where:** `apps/client/src/app/features/editor/chat/chat.component.ts`
(lines ~787–1145). Probably lands as
`features/editor/chat/services/chat-generation-stream.service.ts`.

**Smoke test:** **must** include a real generation flow with an Anthropic
key — there's no other way to exercise every SSE event branch. Cancel,
project switch mid-stream, build-failure auto-fix loop, screenshot
request, ask-user request, refusal — all paths.

**Blocked by:** nothing — `ChatHistoryStore` already extracted, which is
half the dependency. **Blocks:** A2 full chat-component split, since
breaking the stream out unblocks splitting the rest.

**Size:** L.

### Extract `PreviewLifecycleService`

**Why:** `ProjectService.reloadPreview` and its four named branches
already split the work into self-contained methods, but they still live
on `ProjectService`. Moving them to a dedicated service further isolates
the container/preview lifecycle from project identity + chat + export.

**Where:** `apps/client/src/app/core/services/project.ts:317–567`.

**Catch:** the methods read 10+ pieces of state (`projectId`, `isSaved`,
`externalPath`, `detectedConfig`, `currentKit*`, `selectedKitId`,
`tailwindPrefixOverride`, `cloudEditorBlocked`, `loading`, `_loadEpoch`,
`fileStore`). Need to either pass a context object on every call (10+
params), let `PreviewLifecycleService` inject `ProjectService` (circular
dep risk), or keep `cloudEditorBlocked`/`loading` on a sibling
`ProjectStatusStore`.

**Smoke test:** project switching, version restore, kit change,
external-vs-managed paths.

**Size:** L.

### `BaseLLMProvider` primitives — A1 structural

**Why:** anthropic.ts and gemini.ts agent loops *look* similar but differ
in load-bearing API details (Anthropic content blocks vs Gemini parts,
different stream events, different token-counter shapes). The shared
strings + history were extracted in commits `a9ad9b8` / `8a718d9`. The
loop body itself isn't cleanly extractable today.

**Approach to consider:** rather than a `runAgentLoop()` callback monster,
expose lower-level primitives on `BaseLLMProvider`:
`startStream`, `parseStreamEvent`, `buildToolResultMessage`,
`appendUserText`, `extractTokenUsage`. Subclasses implement those; the
loop moves into the base class. Real abstraction with real payoff —
adding a third provider (SAP, OpenAI shim) becomes ~150 lines.

**Where:** `apps/server/src/providers/{base,anthropic,gemini}.ts`.

**Size:** L. Multi-day. Real design work.

### Decompose `chat.component.ts` — A2 full

**Why:** Even after the `chat-tree-helpers.ts` extraction, chat.component
is 1229 lines mixing AI settings popover state, MCP tool loading, model
picker, kit picker, slash commands, Figma context, file attachments, and
generation. Several of those (MCP tools, model picker, slash commands)
could live in their own sub-components or services.

**Where:** `apps/client/src/app/features/editor/chat/chat.component.ts`.

**Blocks:** unblocked by `ChatHistoryStore` and the
`ChatGenerationStreamService` extraction above. Best done after those.

**Size:** L.

---

## Open — Type safety (Medium)

### Server `strict: true` + drop ~80 `as any`

**Why:** Server `tsconfig.json` doesn't have `"strict": true`, and the
codebase has ~80 `as any` casts. Many were stale around the SDK migration
we just did and should now be removable; others are real type-laundering
that strict mode would surface.

**Approach:** flip flags incrementally — `noImplicitAny` first, then
`strictNullChecks`, then full `strict`. Each step surfaces a finite list
that can be triaged. Don't big-bang.

**Where:** `apps/server/tsconfig.json`, then file-by-file as errors
surface.

**Size:** M (incremental) or L (big-bang).

### Hoist shared types to `libs/shared-types/`

**Why:** `AIProfile`, `MCPServerConfig`, `BuiltInToolConfig`,
`SapAiCoreConfig` are duplicated between
`apps/server/src/services/user-settings.service.ts` and
`apps/client/src/app/features/profile/profile.types.ts`. Currently both
sides drift independently — a server-side change wouldn't be enforced on
the client.

**Where:** create `libs/shared-types/src/lib/ai-profile.ts` and friends;
update both sides to import from `@adorable/shared-types`.

**Size:** S.

### Type the client API service end-to-end

**Why:** `apps/client/src/app/core/services/api.ts:14` returns
`Observable<any>` for `generateStream`; chat.component uses
`input<any>(null)` and `signal<any[]>([])` for app settings and available
models. After hoisting shared types (above), wire them through.

**Size:** M (mechanical, but touches many files).

---

## Open — Server cleanup (Small / Medium)

### Handle `pause_turn` / `refusal` stop reasons

**Why:** When server-side tools (web_search) hit their 10-iteration cap,
Anthropic returns `stop_reason: "pause_turn"` and you must re-send the
conversation to resume. Today the agent loop only branches on
`toolUses.length === 0`, so it would silently break out mid-search.
Same for `stop_reason: "refusal"` — currently could loop forever.

**Where:** `apps/server/src/providers/anthropic.ts:302-539`. After the
stream loop, capture `stop_reason` from `message_delta` events.

**Size:** S.

### Server-side compaction (`compact-2026-01-12` beta)

**Why:** We do manual context truncation in `BaseLLMProvider.pruneMessages`.
Anthropic's server-side compaction (GA on Sonnet 4.6 / Opus 4.6 / Opus
4.7) handles this automatically and produces better summaries. Beta
header `compact-2026-01-12`; need to preserve the `compaction` block in
`response.content` on subsequent requests.

**Where:** `apps/server/src/providers/anthropic.ts`,
`apps/server/src/providers/base.ts:313-394`.

**Size:** M. Drop-in but needs care around message-array round-trip.

### Top-level structured logger for routes / middleware / services

**Why:** Q3 covered the agent-loop providers (anthropic.ts, gemini.ts,
base.ts) where DebugLogger is in scope. ~327 `console.*` calls remain in
routes, middleware, services, container managers, kit utilities, and
singletons — places where there's no per-request logger. They need a
top-level logger (pino is small and fast) wrapped behind a thin
`logger.ts` module.

`apps/server/src/logger.ts` already exists with a basic JSONL implementation
that the config validator uses — extending it (or replacing with pino)
and migrating the rest of the call sites is the work.

**Size:** M.

### Use Anthropic SDK typed exceptions

**Why:** Server catches use bare `try/catch` and check error.message with
string matching. SDK exposes `Anthropic.RateLimitError`,
`Anthropic.AuthenticationError`, `Anthropic.APIError`. Better
user-facing messages and clearer retry strategy on 429/529.

**Where:** `apps/server/src/providers/{anthropic,base}.ts`,
`apps/server/src/routes/ai.routes.ts`.

**Size:** S.

### Centralize SAP AI Core config decryption

**Why:** SAP config decryption is duplicated across three sites in
`ai.routes.ts` (`/models` endpoint, `/test-provider` endpoint, the
generate-stream handler). Extract to a `resolveSapConfig(user, provider)`
helper.

**Where:** `apps/server/src/routes/ai.routes.ts:88-100`, lines 600 and
598.

**Size:** S.

### N+1 in `ai.routes.ts:320`

**Why:** Fetches `prisma.project.findFirst` to check `externalPath`,
then a second time at line 459 to do the same. Should fetch once with
`select: { externalPath: true }` and reuse.

**Where:** `apps/server/src/routes/ai.routes.ts:318-330,455-462`.

**Size:** S.

### Replace remaining `as any` casts on Anthropic SDK responses

**Why:** Several streaming-event handlers do `(event.delta as any).type`
and `(event.delta as any).signature`. The SDK has proper discriminated
unions for these. Tighten via type guards (`isDeltaType(event.delta,
'signature_delta')`).

**Where:** `apps/server/src/providers/anthropic.ts:227-229` and similar.

**Size:** S.

---

## Open — Client cleanup (Small)

### `createAsyncState<T>()` helper

**Why:** Every async-fetch component re-implements
`loading`/`error`/`data` signals (versions-panel, dashboard, profile,
project-settings, etc.). A small `createAsyncState(fetchFn, deps)` helper
or migration to Angular 19+ `resource()` removes ~20 lines per call site
and makes error handling uniform.

**Size:** M.

### Replace effect-based data loading with `resource()`

**Why:** Several components watch a signal in `effect()` and trigger an
HTTP fetch (e.g. `versions-panel.component.ts:38-53` watching `projectId`
+ `saveVersion`). Angular 19's `resource()` primitive does this with
built-in cancellation, race-condition handling, and loading state.

**Size:** M.

### Investigate `ngZone.run()` in zoneless app

**Why:** `apps/client/src/app/app.ts:68,74,79` calls `ngZone.run()` for
Electron IPC callbacks. The app uses `provideZonelessChangeDetection()`
so this is suspect — either signals aren't tracking the IPC update
properly (real bug), or these are no-op leftovers.

**Size:** S (investigation), M (fix if real bug).

---

## Open — Database / build

### Auto-generate migration entries from `prisma/migrations/*/migration.sql`

**Why:** `db:generate-fresh-schema` (A5) auto-generates the fresh-schema
SQL from `prisma/schema.prisma`. The migrations array in
`apps/desktop/db-init.ts` is still hand-written for each schema change.
Since `prisma migrate dev` already generates a `migration.sql` per
schema change, we could generate the migrations array from those files
too.

**Caveat:** each migration entry needs a developer-chosen default for
the new column when the existing schema can't supply one; pure SQL diff
might not capture that intent. Could be a "scaffold a migration entry,
prompt for defaults" tool rather than full automation.

**Where:** `apps/desktop/db-init.ts`, `apps/desktop/scripts/`.

**Size:** M.

### Drop `@prisma/client` from desktop bundle

**Why:** Desktop builds the full Prisma client (6.4.1) but actually
uses `better-sqlite3` directly via `db-init.ts`. Redundant dependency,
~5–10 MB of bloat.

**Where:** `apps/desktop/package.json` (or wherever Prisma gets bundled
in `npm run build:desktop`).

**Caveat:** verify nothing on the server (which IS bundled into the
desktop app) actually uses Prisma at runtime in desktop mode before
removing.

**Size:** S (investigate), M (fix).

### Encryption-key migration / rotation tool

**Why:** A5's backward-compat path seeds upgrading desktop installs with
the legacy default `'default-insecure-key-change-me'` so existing
encrypted data stays decryptable. That's a transitional state — those
users are still encrypting new credentials with the insecure key. A
proper migration would re-encrypt all stored credentials with a fresh
random key, then update `.encryption-key`.

**Where:** new helper in `apps/desktop/`, called once on first launch
after a sufficiently new release.

**Size:** M. Needs care: must be atomic (don't half-rotate), must be
idempotent (rerun safe).

---

## Open — Tests / CI

### Test coverage for critical services

**Why:** Per the cross-cutting review, the repo has 17 spec files for
100+ source files. The recently-extracted stores
(`ChatHistoryStore`, `KitManagementStore`, `FigmaImportsStore`,
`ProjectExportService`) and the new pure helpers
(`agent-loop-messages.ts`, `chat-tree-helpers.ts`,
`binary-file.utils.ts`) are now isolated and trivially testable —
ideal first targets.

**Where:** `apps/client/src/app/core/services/*.spec.ts`,
`apps/server/src/providers/*.spec.ts`.

**Size:** M (per-target).

### CI gate for `db:check-fresh-schema`

**Why:** A5 added `npm run db:check-fresh-schema` which exits 1 if
`apps/desktop/db-fresh-schema.generated.ts` is out of sync with
`prisma/schema.prisma`. Wire it into CI so a forgotten regeneration
fails the build instead of shipping a wrong desktop schema.

**Where:** wherever GitHub Actions / CI configs live.

**Size:** S.

---

## Open — Misc polish

### Move `figmaImports` consumers off of `ProjectService`

**Why:** `FigmaImportsStore` was extracted in `cde5e13` but
`workspace.component.ts` still writes via
`projectService.figmaImports.set(...)` because the back-compat getter
makes it work. Eventually update those call sites to inject
`FigmaImportsStore` directly so the back-compat layer can be removed.

**Same pattern applies to:** `ChatHistoryStore`, `KitManagementStore` —
all consumers currently still go through `ProjectService`. The back-
compat wrappers are intentional for now (zero-risk extraction) but
shouldn't live forever.

**Where:** `apps/client/src/app/features/editor/workspace/workspace.component.ts:1214,1234`
+ similar for chat / kit consumers.

**Size:** S each, M total.

### `ProjectStatusStore` for `loading` / `cloudEditorBlocked` / `buildError`

**Why:** Three signals on `ProjectService` are pure UI status, not
project identity. Extracting them lets `PreviewLifecycleService`
(open item above) be cleanly carved out without circular DI.

**Size:** S.

### `ExternalProjectStore` for `externalPath` + `detectedConfig`

**Why:** Both signals are tightly coupled — they only matter for desktop
"Open Folder" projects. A typed store would name the concept and unblock
desktop-only UI components from depending on the full `ProjectService`.

**Size:** S.

---

## Notes on order

If you pick items off this list:

1. The **architectural Larges** (ChatGenerationStreamService,
   PreviewLifecycleService, BaseLLMProvider primitives, chat split) each
   want their own session and end-to-end smoke testing. Don't tuck them
   into a refactor sprint.

2. The **Smalls** can land any time; some pair naturally
   (e.g. "centralize SAP config decryption" + "N+1 in ai.routes.ts" both
   touch `ai.routes.ts`).

3. **Test coverage** is foundational — ideally land a few specs on the
   newly-extracted stores *before* the next big refactor, so the next
   round of moves has a safety net.

4. **`strict: true`** is best done in a quiet week — surfaces a finite
   but real list of legitimate bugs that need triage.
