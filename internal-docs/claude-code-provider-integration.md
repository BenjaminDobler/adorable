# Claude Code Provider Integration — Complete Plan

Status: Proposal / not yet implemented
Owner: TBD
Target: Desktop app (Electron) only

## Goals

1. Let users run Adorable's agent loop via their local `claude` CLI, authenticated with their own Pro/Max subscription.
2. Desktop-only, opt-in, additive (existing providers untouched).
3. Leverage Claude Code's native session system for multi-turn continuity and memory.
4. Lay groundwork for exposing Adorable's bespoke tools (Figma bridge, kit-tools) via MCP.

## Licensing context

- **Claude Agent SDK** — officially requires `ANTHROPIC_API_KEY`. Using Pro/Max OAuth tokens with the SDK is **not permitted** per Anthropic's legal/compliance docs (updated ~Feb 2026). Ruled out for this feature.
- **Claude Code CLI** — explicitly supported with Pro/Max subscription via `claude login`. This is the sanctioned path.
- **Framing we rely on:** the user has their own `claude` install on their own machine, authenticated with their own subscription. Adorable is a frontend that shells out to their local tool. No credentials live in Adorable.

## Architecture Overview

```
Adorable UI (chat)
      │
      ▼
/api/generate-stream   ◄── unchanged SSE contract
      │
      ▼
ProviderFactory ──► ClaudeCodeProvider (new)
                         │
                         ▼
                   spawn('claude', ['-p', ...])
                         │
                   stdout: JSONL events
                         │
                         ▼
                   Event translator ──► StreamCallbacks
                         │                   │
                         ▼                   ▼
                   onText/onToolCall    onFileWritten
                   onToolResult         onTokenUsage
```

- **Claude Code owns:** context management, its own tools (Read/Write/Edit/Bash/Grep/Glob), its own skills, its own subagent orchestration, its own review.
- **Adorable owns:** the UI, project state, file watching, history storage, session tracking, and (later) MCP-exposed Adorable-specific tools.

## Why this fits cleanly

After reading the current provider system:

- `LLMProvider` interface (`apps/server/src/providers/types.ts:93`) is just one method: `streamGenerate(options, callbacks)`. `ClaudeCodeProvider` can implement it directly without extending `BaseLLMProvider`.
- `ProviderFactory` (`apps/server/src/providers/factory.ts`) is a 10-line switch — adding a third case is trivial.
- `ai.routes.ts` already translates callbacks into SSE events. The callback interface is the contract, not the base class.
- Most `GenerateOptions` fields (`reasoningEffort`, `researchAgentEnabled`, `reviewAgentEnabled`, `forcedSkill`, `contextSummary`, `sapAiCore`, etc.) describe concepts Adorable's loop owns. Claude Code owns its own equivalents. The new provider ignores them — that's fine and correct.

---

## Phase 1 — Foundation (ship v1)

**Goal:** Basic Claude Code integration working end-to-end.

### 1.1 Detection endpoint

**File:** `apps/server/src/routes/system.routes.ts` (new or append)

- `GET /api/system/claude-code-status`
- Shells out to `which claude` / `where claude` (platform-aware).
- If found, runs `claude --version` to confirm it's the real binary.
- Probes auth state by running a trivial command and checking exit code / stderr (or checking for `~/.claude/` existence — TBD during implementation).
- Returns `{ available: boolean, version?: string, loggedIn: boolean, path?: string }`.
- Caches result for ~30s to avoid re-spawning on every page load.
- **Guard:** only returns `available: true` when `process.env['ADORABLE_DESKTOP_MODE'] === 'true'`.

### 1.2 Client UI: provider option

**Files:**
- `apps/client/src/app/features/profile/*` (verify exact path during impl)
- `libs/shared-types/src/lib/shared-types.ts` — extend `aiProvider` enum with `'claude-code'`

Changes:
- New "Claude Code (local)" option in the provider dropdown.
- On settings page load, call `/api/system/claude-code-status`; hide the option if `available === false`.
- Status indicator next to the option:
  - ✓ "Installed and logged in"
  - ⚠ "Installed — run `claude login` in a terminal"
  - (hidden) if not installed
- When selected, **do not show** an API key input.
- Info box: "Uses your local Claude Code subscription. No API key needed. Available in desktop app only."

### 1.3 Database: session tracking

**File:** `prisma/schema.prisma`

Add to `Project`:

```prisma
claudeCodeSessionId String? // Claude Code session ID for --resume
```

**Recommendation:** start with a single column on `Project` (one session per project). Simplest, matches "this project's conversation." Can be moved to a per-conversation model later if needed.

**Don't forget (per CLAUDE.md):**
- `npx prisma migrate dev --name add_claude_code_session`
- Update `apps/desktop/db-init.ts`:
  1. Add column to `createFreshSchema()`
  2. Add new migration entry with bumped version
  3. Bump `LATEST_VERSION`

### 1.4 The provider itself

**File:** `apps/server/src/providers/claude-code.ts` (new)

```ts
export class ClaudeCodeProvider implements LLMProvider {
  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    // 1. Guard: desktop mode only
    if (process.env['ADORABLE_DESKTOP_MODE'] !== 'true') {
      throw new Error('Claude Code provider is only available in desktop mode');
    }

    // 2. Resolve real project directory on disk
    //    (external path or projectFsService.getProjectPath)
    const cwd = await this.resolveProjectCwd(options.projectId);

    // 3. Load stored session ID for this project
    const sessionId = await this.loadSessionId(options.projectId);

    // 4. Build args
    const args = ['-p', options.prompt, '--output-format', 'stream-json'];
    if (sessionId) args.push('--resume', sessionId);
    // Pass attached images as file refs in prompt, or via --image flag if supported

    // 5. Spawn
    const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });

    // 6. Parse JSONL stream line-by-line
    //    - translate events to callbacks
    //    - capture session_id from init event
    //    - watch for file writes via tool_use events (Write/Edit)
    await this.parseStream(child, callbacks, async (newSessionId) => {
      await this.saveSessionId(options.projectId, newSessionId);
    });

    // 7. Handle stderr (log errors, surface to user on non-zero exit)
    // 8. Return on exit
  }
}
```

**Event translation table:**

| Claude Code event | Adorable callback |
|---|---|
| `system.init` | Capture `session_id`, persist to DB |
| `assistant.message` text block | `onText(text)` |
| tool_use `Write` | `onToolCall('write_file', args)` + `onFileWritten(path, content)` |
| tool_use `Edit` | `onToolCall('edit_file', args)` + `onFileWritten(path, newContent)` |
| tool_use `Read` | `onToolCall('read_file', args)` |
| tool_use `Bash` | `onToolCall('run_command', {command})` |
| tool_use `Grep`/`Glob` | `onToolCall('search', args)` |
| `user.message` tool_result | `onToolResult(tool_use_id, content, name)` |
| `result` (final) | `onTokenUsage({input, output, ...})` |
| stderr (non-empty on non-zero exit) | throw |

**Important:** the exact JSONL schema must be **verified against the current `claude` version** during implementation. Don't assume field names.

### 1.5 Factory wiring

**File:** `apps/server/src/providers/factory.ts`

```ts
case 'claude-code':
  return new ClaudeCodeProvider();
```

### 1.6 Route integration

**File:** `apps/server/src/routes/ai.routes.ts`

- No changes to the SSE translation layer (callbacks are already the contract).
- When `provider === 'claude-code'`, skip loading `effectiveApiKey` (not needed).
- Skip `mcpConfigs` loading in Phase 1 (Claude Code manages its own MCP); revisit in Phase 3.
- Pass through the same `GenerateOptions`; the provider ignores fields it doesn't care about.

### 1.7 Smoke test checklist

- [ ] Fresh desktop app, no `claude` installed → option hidden
- [ ] `claude` installed, not logged in → option shown with warning
- [ ] `claude` installed + logged in → option shown, selectable
- [ ] Single-turn "create an Angular button component" → text streams, file writes appear, preview reloads
- [ ] Multi-turn "now make it bigger" → resumes session, has context from turn 1
- [ ] Close project, reopen, continue conversation → session resumes from DB
- [ ] Build error path → user asks to fix; Claude Code's own loop handles it
- [ ] Switch back to Anthropic provider mid-project → works, no state corruption

---

## Phase 2 — Session & Memory Polish

**Goal:** Make the session/memory experience feel native and recoverable.

### 2.1 Session lifecycle management

- **Clear conversation** button → null out `claudeCodeSessionId` on next turn.
- **Session expiration handling**: if `--resume <id>` fails (Claude Code garbage-collected the session), catch the error, clear the stored ID, retry without `--resume`, surface a one-line notice: "Previous session expired, starting fresh."
- **Session inspection (dev tool)**: admin-only endpoint `/api/system/claude-code-session/:projectId` that returns the stored ID and optionally reads the JSONL transcript from `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` for debugging.
- **Conversation vs project**: if a per-conversation concept is added later, move `claudeCodeSessionId` off `Project` onto that model.

### 2.2 Leverage CLAUDE.md for project memory

Claude Code reads `CLAUDE.md` from the project root on every turn. This is **free memory** for the feature.

- **On first Claude Code generation in a project**, if no `CLAUDE.md` exists, auto-create one with Adorable's standard context (Angular 21, standalone components, zoneless, the active kit's conventions, etc.) — a condensed version of what `context-builder.ts` injects for the Anthropic/Gemini providers.
- **Kit-aware memory**: when the active kit changes, update a delimited `## Component Kit` section in `CLAUDE.md` using markers like `<!-- adorable:kit-start -->` / `<!-- adorable:kit-end -->` so user edits elsewhere in the file are preserved.
- **User memory respect**: do NOT touch `~/.claude/CLAUDE.md` (the user's global memory).

### 2.3 Leverage Claude Code's auto-memory system

Claude Code has its own auto-memory system (`~/.claude/projects/.../memory/`). Treat it as opaque state:
- Don't replicate or override it.
- Ensure spawned `claude` inherits the user's real environment so it can access its memory store.
- Document that "Claude Code remembers context across sessions via its built-in memory system; clearing a conversation in Adorable doesn't erase project memory."

### 2.4 Image / attachment support

- `GenerateOptions.images` is base64 data URIs.
- Claude Code `-p` mode's exact image input mechanism — verify during implementation (likely `--image <path>` or inline).
- Approach: write base64 images to OS temp dir, pass paths to `claude`, clean up after exit.

### 2.5 Cancellation

- Existing route handles client disconnects; wire up `child.kill('SIGTERM')` on disconnect.
- 2s grace period, then `SIGKILL`.

### 2.6 Cost / usage display

- Claude Code's `result` event reports token counts.
- For subscription users, **don't** compute a dollar cost — display token counts with subtitle: "Included in your Claude subscription".
- Store usage in analytics tagged `provider: 'claude-code'`, `cost: 0`.
- Admin analytics: add a filter to separate subscription vs. API-key usage.

---

## Phase 3 — Expose Adorable's Tools via MCP

**Goal:** Let the user's Claude Code instance call Adorable-specific tools (Figma bridge, kit-tools, screenshot, visual editing IDs) without changing the licensing story.

### Why MCP, not direct tool injection

Claude Code connects to local MCP servers via `.mcp.json` in the project root or `~/.claude.json`. This is the **sanctioned extension point** — doesn't require modifying Claude Code, doesn't touch subscription OAuth, and puts Adorable's tools on equal footing with Claude Code's built-ins.

### 3.1 Stand up an Adorable MCP server

**Files:**
- `apps/server/src/mcp/adorable-mcp-server.ts` (new)
- `apps/server/src/mcp/adorable-mcp-bin.ts` (standalone entrypoint)

- Uses `@modelcontextprotocol/sdk`.
- Runs as a **separate child process** that Claude Code spawns.
- Communicates over stdio per MCP spec.
- Exposes tools that Claude Code doesn't already have:
  - `figma_get_selection` — proxies to existing `figma-bridge.service`
  - `figma_read_node`
  - `figma_get_variables`
  - `figma_compare_dom` — the Phase 4 auto-fix compare tool
  - `kit_list_components`
  - `kit_get_component` (source + usage examples)
  - `visual_editing_id_lookup`
  - `browse_screenshot` — proxies to CDP service
  - `browse_console`

### 3.2 Project-level .mcp.json generation

When the user starts a Claude Code generation in a project for the first time, auto-generate `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "adorable": {
      "command": "node",
      "args": ["/path/to/adorable-mcp-bin.js"],
      "env": {
        "ADORABLE_USER_ID": "...",
        "ADORABLE_PROJECT_ID": "...",
        "ADORABLE_SERVER_URL": "http://localhost:3333"
      }
    }
  }
}
```

- Resolve MCP binary path from Electron app install location.
- The MCP server process talks back to the main Adorable server over HTTP/IPC to access Figma bridge, CDP, kit data.
- Claude Code will prompt the user: "Allow connection to MCP server 'adorable'?" — expected and fine.

### 3.3 Migration of existing skills

Adorable already has `.claude/skills/figma-bridge/`. Claude Code auto-discovers skills from `<project>/.claude/skills/`, so half of Phase 3 may already work. Verify:
- Discovery behavior of current `claude` version.
- That skill instructions operate without Adorable's in-process tool executor (they'd need the MCP tools from 3.1).

### 3.4 Tool overlap strategy

**Do not re-expose** Claude Code's built-ins (`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`). Only expose tools Claude Code doesn't have:
- Figma bridge (unique)
- Kit-aware component access (unique)
- Visual editing ID lookup (unique)
- CDP browser tools wired to the live preview (unique vs generic browser automation)

### 3.5 Testing

- [ ] Select Claude Code provider, open a project with generated `.mcp.json`
- [ ] Ask "match the selected Figma frame"
- [ ] Claude Code calls `figma_get_selection` via MCP
- [ ] Tool result flows back, Claude Code writes Angular component code
- [ ] File change appears in Adorable's file tree
- [ ] Preview reloads

---

## Phase 4 — Parity & Polish

Follow-up work, not v1 requirements.

### 4.1 Subagent support
Claude Code's Task tool spawns subagents. Nested events in stream-json — extend the translator to render nested tool calls in the UI (indented in the chat timeline).

### 4.2 Plan mode parity
Adorable has `planMode`. Claude Code has its own plan mode. When Adorable's plan mode is on, pass `--permission-mode plan` (or current equivalent) to `claude`. Verify flag at implementation time.

### 4.3 Model selection
Claude Code lets the user pick Opus/Sonnet/Haiku via `--model`. Map Adorable's model selector to `--model` when Claude Code is active. Hide the existing Anthropic model dropdown when Claude Code is selected.

### 4.4 Settings override
When Claude Code is active, Adorable settings for research/review/kit lessons are **grayed out** with tooltip: "Managed by Claude Code."

### 4.5 Diff UX
Claude Code's Edit tool produces structured diffs. Parse from stream-json and render inline diffs in the chat UI.

### 4.6 Linux/Windows validation
v1 targets macOS. Phase 4: test binary detection on Linux (`which claude`) and Windows (`where claude`, handle `.cmd`/`.exe` wrapping for spawn).

---

## Risks & Open Questions

Verify during Phase 1 implementation:

1. **Exact stream-json event schema** in the current `claude` version. Only authoritative source is running the CLI. Budget ~1hr at the start of Phase 1 for `claude -p "write hello world to test.txt" --output-format stream-json --verbose` and capture a reference transcript.
2. **Does `--resume` preserve `cwd` context?** Test resuming from a different cwd.
3. **Session storage location across OS.** `~/.claude/projects/` on macOS/Linux; Windows may differ. Don't hardcode — let Claude Code manage it.
4. **Image input format** in `-p` mode.
5. **stderr noise.** Distinguish real errors from chatter.
6. **Process lifecycle on Electron quit.** Track active children, kill on `app.on('before-quit')`.
7. **Concurrent generations.** Adorable allows one per project — verify the route enforces it so two `claude --resume <same-id>` can't race.
8. **Licensing re-verification.** Before shipping, re-read Anthropic's current AUP and Claude Code terms. The "user's install, user's auth, local execution" framing should be solid, but this area has moved recently.

---

## Implementation Order

1. **[Day-1 spike, ~2-4 hours]** Run `claude -p ... --output-format stream-json` manually, capture the event schema, write a standalone Node.js script that spawns `claude` and prints translated events. **Don't touch Adorable code yet.** De-risks everything.
2. **[Phase 1.1]** Detection endpoint.
3. **[Phase 1.3]** DB migration + desktop db-init update.
4. **[Phase 1.4]** `ClaudeCodeProvider` implementation, built from the spike script.
5. **[Phase 1.5]** Factory wiring (1 line).
6. **[Phase 1.2]** Client UI: provider option + status indicator.
7. **[Phase 1.7]** End-to-end smoke test with a real project.
8. **[Phase 2.1]** Session lifecycle error handling.
9. **[Phase 2.2]** Auto-generated `CLAUDE.md` for projects.
10. **[Phase 2.5]** Cancellation.
11. **[Phase 2.6]** Usage display without dollar cost.
12. **Ship v1.** Gather feedback.
13. **[Phase 3]** MCP integration, starting with Figma bridge (highest-value unique capability).
14. **[Phase 4]** Polish as demand dictates.

---

## Files That Will Change

**New:**
- `apps/server/src/providers/claude-code.ts`
- `apps/server/src/providers/claude-code-stream-parser.ts` (if parsing is non-trivial)
- `apps/server/src/routes/system.routes.ts` (or append to existing)
- `apps/server/src/mcp/adorable-mcp-server.ts` (Phase 3)
- `apps/server/src/mcp/adorable-mcp-bin.ts` (Phase 3)
- `prisma/migrations/<timestamp>_add_claude_code_session/migration.sql`

**Modified:**
- `apps/server/src/providers/factory.ts` (1 line)
- `apps/server/src/routes/ai.routes.ts` (skip API key load for claude-code provider)
- `prisma/schema.prisma`
- `apps/desktop/db-init.ts` (new migration entry + schema update)
- `libs/shared-types/src/lib/shared-types.ts` (provider enum + settings type)
- `apps/client/src/app/features/profile/*` (UI)
- `apps/client/src/app/core/services/api.ts` (new status endpoint call)

**Untouched:**
- `apps/server/src/providers/base.ts`
- `apps/server/src/providers/anthropic.ts`
- `apps/server/src/providers/gemini.ts`
- `apps/server/src/providers/tool-executor.ts`
- `apps/server/src/providers/context-builder.ts`
- All existing skills/tools/MCP infrastructure (Phase 1 & 2)

---

## Summary

- **Phase 1** — small, contained, additive: detect → new provider → stream translator → UI toggle. ~200–300 lines of new code, zero modifications to existing providers. Ships a working "replace the AI loop with my local Claude Code subscription" experience.
- **Phase 2** — makes sessions and memory feel native by persisting `session_id` per project, handling expiration, and auto-managing project `CLAUDE.md`.
- **Phase 3** — real differentiation: Adorable's unique tools (Figma bridge, kit awareness, visual editing IDs) become available to Claude Code via an MCP server.
- **Phase 4** — polish: subagents, plan mode, model selection, Windows support.

The plan is deliberately front-loaded with a **half-day spike** to de-risk the stream-json schema before writing production code.
