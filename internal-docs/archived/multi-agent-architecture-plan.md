# Multi-Agent Architecture for Adorable

## Context

Adorable's AI currently uses a **single sequential agentic loop**: one LLM call at a time, tools executed one by one, everything in a single conversation context. This works but has limitations:

- **Speed**: File reads, writes, and builds execute sequentially even when independent
- **Context waste**: The main generation agent spends turns reading/exploring files that could be done upfront
- **No quality gate**: Generated code goes straight to production without review
- **No specialization**: One agent does everything — research, generation, building, visual verification

Modern tools like Claude Code CLI solve these with sub-agents — isolated LLM instances with their own context, running in parallel or sequentially for specialized tasks.

**Goal**: Add multi-agent capabilities to Adorable in incremental levels, starting with the highest-impact/lowest-effort changes.

---

## Level 1: Parallel Tool Execution Within Turns

**Impact: High | Effort: Low**

### Problem
The LLM already returns multiple independent tool calls in a single response (the system prompt even instructs it to batch). But `executeTool()` runs them in a sequential `for...of` loop. Reading 5 files takes 5x as long as it should.

### Solution
Classify tools as **parallelizable** or **sequential**, then execute parallelizable tools concurrently with `Promise.all`.

**Parallelizable tools** (read-only, no side effects):
- `read_file`, `read_files`, `list_dir`, `glob`, `grep`
- `browse_screenshot`, `browse_console`, `browse_evaluate`, `browse_accessibility`
- `inspect_component`, `inspect_routes`, `inspect_signals`, `inspect_styles`, `inspect_dom`, `measure_element`, `inspect_errors`, `get_bundle_stats`, `get_container_logs`

**Sequential tools** (mutations, side effects, order-dependent):
- `write_file`, `write_files`, `edit_file`, `delete_file`, `rename_file`, `copy_file`
- `run_command`, `verify_build`, `clear_build_cache`
- `browse_navigate`, `browse_click`, `type_text`, `inject_css`
- `ask_user`, `activate_skill`, `save_lesson`, `take_screenshot`
- `inspect_performance` (start/stop are stateful)
- `inspect_network` (start/get/clear are stateful)

### Key Files to Modify

| File | Change |
|------|--------|
| `apps/server/src/providers/base.ts` | Add `isParallelizable(toolName)` helper; refactor `executeTool` to support batch execution |
| `apps/server/src/providers/anthropic.ts` | Replace sequential `for` loop (line ~292) with parallel/sequential grouping logic |
| `apps/server/src/providers/gemini.ts` | Same change for Gemini's tool execution loop (line ~213) |

### Implementation

1. Add a `PARALLELIZABLE_TOOLS` set in `base.ts` with all read-only tool names
2. In each provider's tool execution section:
   - Group consecutive parallelizable tools into batches
   - Execute each batch with `Promise.all`
   - Execute sequential tools one at a time (preserving order)
   - Collect all results in the correct order for the message history
3. Callbacks (`onToolCall`, `onToolResult`) still fire per-tool for UI updates

### Example
If the LLM returns: `[read_file("a.ts"), read_file("b.ts"), read_file("c.ts"), write_file("d.ts", ...), verify_build()]`

Execution becomes:
```
Batch 1 (parallel): read_file("a.ts"), read_file("b.ts"), read_file("c.ts")
Sequential: write_file("d.ts", ...)
Sequential: verify_build()
```

---

## Level 2: Post-Generation Review Agent

**Impact: Medium-High | Effort: Medium**

### Problem
Generated code goes straight to the user without quality review. Common issues (unused imports, missing error handling, accessibility problems, inconsistent naming) slip through.

### Solution
After the main generation loop completes and the build passes, spawn a lightweight **reviewer agent** — a separate LLM call with its own system prompt, read-only tool access, and a cheaper/faster model.

### Architecture

```
Main Generation Loop (existing)
  ↓ build passes
Post-Loop Review Phase (NEW)
  ↓ spawn reviewer agent
  Reviewer reads generated/modified files
  Reviewer checks against review checklist
  Reviewer returns structured feedback
  ↓ if issues found
  Main agent applies fixes (optional, configurable)
```

### Key Files to Modify

| File | Change |
|------|--------|
| `apps/server/src/providers/base.ts` | Add `runReviewPhase()` method to `BaseLLMProvider`; call from `postLoopBuildCheck` after build succeeds |
| `apps/server/src/providers/anthropic.ts` | Implement reviewer LLM call with separate system prompt, restricted tools |
| `apps/server/src/providers/gemini.ts` | Same for Gemini |
| `apps/server/src/providers/types.ts` | Add `reviewEnabled?: boolean` to `GenerateOptions` |

### Implementation

1. Add a `REVIEW_SYSTEM_PROMPT` constant with review checklist:
   - Unused imports/variables
   - Missing error handling
   - Accessibility (ARIA labels, semantic HTML)
   - Angular best practices (OnPush, trackBy, signal patterns)
   - Consistency with existing code style

2. `runReviewPhase(ctx, modifiedFiles)`:
   - Collect list of files written/edited during generation
   - Read their current contents
   - Call LLM with review prompt + file contents + read-only tools
   - Use cheaper model (Haiku/Flash) for cost efficiency
   - Return structured issues list: `{ file, line, severity, message, suggestedFix }`

3. Stream review results to the UI via existing `callbacks.onText()`

4. Optionally: auto-apply fixes if `reviewAutoFix` is enabled in settings

### Configuration
- Enable/disable via user settings (`reviewEnabled: boolean`)
- Model selection for reviewer (default: cheapest available)
- Auto-fix mode vs. report-only mode

---

## Level 3: Parallel Research Phase

**Impact: Medium | Effort: Medium**

### Problem
The main generation agent spends 2-3 turns just reading files before it can start writing code. Each read turn is a full LLM round-trip. For complex tasks touching many files, this exploration phase can take 30-60 seconds.

### Solution
Before the main generation loop, run a **research phase** that reads relevant files in parallel and feeds summarized context to the main agent.

### Architecture

```
Research Phase (NEW)
  ↓ analyze user request
  Spawn 2-3 reader agents in parallel
  Each reads a subset of files and summarizes
  ↓ combine summaries
Main Generation Loop (existing, with richer initial context)
```

### Key Files to Modify

| File | Change |
|------|--------|
| `apps/server/src/providers/base.ts` | Add `runResearchPhase()` method; call before main loop |
| `apps/server/src/providers/anthropic.ts` | Implement parallel research calls |
| `apps/server/src/providers/gemini.ts` | Same for Gemini |
| `apps/server/src/providers/types.ts` | Add research config to `GenerateOptions` |

### Implementation

1. `runResearchPhase(ctx, userPrompt, fileStructure)`:
   - Use a lightweight LLM call to analyze the user's request and identify which files are likely relevant
   - Group files into 2-3 clusters (e.g., "components to modify", "services to understand", "config files")
   - Spawn parallel LLM calls, each with read-only tools and a specific research focus
   - Each returns a summary: key patterns found, relevant code snippets, dependencies
   - Combine summaries into a "Research Context" block injected into the main agent's first message

2. Research agent system prompt:
   - "You are a code researcher. Read the specified files and provide a concise summary..."
   - Only `read_file`, `read_files`, `list_dir`, `glob`, `grep` tools available
   - Max 3 turns, max 2000 tokens output

3. Skip research phase for simple requests (detected via heuristics or user setting)

---

## Level 4: Specialized Agent Delegation

**Impact: High | Effort: High**

### Problem
One agent handles everything — research, generation, build fixing, visual verification. Each task has different optimal system prompts, tool access, and models.

### Solution
Create distinct **agent roles** with specialized system prompts and tool restrictions. The main orchestrator delegates to the appropriate agent for each phase.

### Agent Roles

| Role | Tools | Model | Purpose |
|------|-------|-------|---------|
| **Orchestrator** | All | Best available | Decomposes task, delegates to specialists |
| **Code Generator** | write_file, write_files, edit_file, read_file, read_files, list_dir, glob, grep | Best available | Writes and modifies code |
| **Build Fixer** | edit_file, read_file, verify_build, run_command, inspect_errors | Fast model | Fixes build errors surgically |
| **Visual Verifier** | browse_screenshot, browse_console, browse_evaluate, inspect_styles, measure_element, inspect_dom | Vision model | Checks rendered output against intent |
| **Test Writer** | write_file, read_file, read_files, run_command | Best available | Generates test files |

### Architecture

```
Orchestrator
  ├── Research Agents (parallel, read-only) → context
  ├── Code Generator (with research context) → files
  ├── Build Fixer (if build fails) → fixes
  ├── Visual Verifier (if CDP enabled) → screenshot analysis
  └── Test Writer (if tests requested) → test files
```

### Key Files to Modify

| File | Change |
|------|--------|
| `apps/server/src/providers/base.ts` | Add `AgentRole` enum, role-specific system prompts, tool filtering per role |
| `apps/server/src/providers/anthropic.ts` | Refactor to support spawning sub-agent LLM calls with different configs |
| `apps/server/src/providers/gemini.ts` | Same |
| `apps/server/src/providers/tools.ts` | Add `roles?: AgentRole[]` to each tool definition for filtering |

### Implementation

1. Define `AgentRole` enum: `orchestrator`, `codeGenerator`, `buildFixer`, `visualVerifier`, `testWriter`, `reviewer`
2. Each tool definition gets a `roles` array (which agents can use it)
3. Each role has its own system prompt (stored in `apps/server/src/providers/agent-prompts/`)
4. `spawnSubAgent(role, context, maxTurns)` method creates an isolated LLM call with:
   - Role-specific system prompt
   - Filtered tool set
   - Fresh message history (no parent context bleed)
   - Model selection per role
5. Results returned as structured output to the orchestrator

---

## Level 5: Agent Teams (Future)

**Impact: Very High | Effort: Very High**

### Concept
For large tasks (multi-component features, full-app scaffolding), decompose work into a **shared task list** and spawn parallel workers.

### Architecture

```
Team Lead (Orchestrator)
  ├── Creates task list with dependencies
  ├── Workers self-claim tasks
  ├── File locking prevents conflicts
  ├── Workers report completion
  └── Team Lead aggregates and verifies
```

### Key Components
- **Task List Service**: Shared state with tasks, statuses (pending/in_progress/completed/blocked), dependencies
- **Worker Agents**: Each gets a git worktree (or virtual filesystem branch) for isolation
- **File Lock Manager**: Prevents simultaneous edits to the same file
- **Merge Coordinator**: Combines changes from parallel workers
- **Quality Gate**: Reviewer agent checks final merged output

This level would require significant infrastructure (worker management, file locking, merge resolution) and is best deferred until Levels 1-3 prove the pattern.

---

## Implementation Order

| Phase | Level | Estimated Effort | Key Benefit |
|-------|-------|-----------------|-------------|
| 1 | Level 1: Parallel tool execution | 1-2 days | Immediate speed improvement, no architectural change |
| 2 | Level 2: Review agent | 2-3 days | Quality improvement, catches common issues |
| 3 | Level 3: Research phase | 2-3 days | Faster context gathering, richer initial context |
| 4 | Level 4: Specialized agents | 1-2 weeks | Full agent delegation, best quality |
| 5 | Level 5: Agent teams | 2-4 weeks | Parallel generation for large tasks |

### Recommended Starting Point
**Level 1** (parallel tool execution) is the clear first step — high impact, low risk, minimal code changes. It can be shipped independently and provides immediate value.

---

## Plans, Tasks & Storage

Multi-agent orchestration needs a place to store plans (what will be built), tasks (decomposed work items), and status tracking. The storage approach must work for both internal projects (managed by Adorable's database) and external projects (opened from disk on desktop).

### Storage Strategy: Hybrid

Different concerns live in different places:

| What | Where | Why |
|------|-------|-----|
| **Agent task list** (internal coordination between parallel workers) | In-memory, `AgentLoopContext` | Ephemeral — only needed during a single generation session |
| **User-visible plan** (high-level plan of what will be built) | `.adorable/plans/` in project FS | User can see/edit it, AI reads it with existing `read_file`/`write_file` tools |
| **Task board** (decomposed work items with status) | `.adorable/tasks.json` in project FS | Structured, queryable by AI, visible in UI, survives session restarts |
| **Generation history** (what was done, outcomes) | Database, linked to `ChatMessage` model | Persistent, queryable, part of conversation history |

### The `.adorable/` Convention

This convention already exists — the skill system scans `.adorable/skills/` in both internal and external projects via `FileSystemInterface`. Plans and tasks follow the same pattern:

```
project-root/
├── .adorable/
│   ├── skills/              ← already exists
│   ├── plans/               ← NEW: AI-generated plans
│   │   └── current-plan.md  ← active plan (Markdown, human-readable)
│   └── tasks.json           ← NEW: task board (structured JSON)
├── src/
├── package.json
└── ...
```

**Works for both project types:**
- **Internal projects**: `.adorable/` lives inside `storage/projects/{projectId}/`
- **External projects**: `.adorable/` lives inside the opened project directory on disk
- **Same `FileSystemInterface`**: The AI uses `read_file`/`write_file` which abstracts away the difference

**Git integration:**
- On first use, auto-append `.adorable/` to the project's `.gitignore` (unless already present)
- Or make it configurable: some teams may want to commit plans for collaboration
- The AI should check and offer to add the `.gitignore` entry when creating `.adorable/` for the first time

### Data Model: Plan

Stored as Markdown at `.adorable/plans/current-plan.md` — human-readable and editable:

```markdown
# Plan: Add User Authentication

## Goal
Add JWT-based authentication with login/register pages and route guards.

## Approach
- Use Angular standalone components with signals
- JWT tokens stored in localStorage
- Auth interceptor for API requests
- Route guards for protected pages

## Components
1. LoginComponent — form with email/password
2. RegisterComponent — form with name/email/password
3. AuthService — login, register, logout, token management
4. AuthInterceptor — attach JWT to outgoing requests
5. AuthGuard — protect routes

## Status: in-progress
```

The AI creates/updates this with `write_file('.adorable/plans/current-plan.md', ...)`. Users can view it in the file explorer or a dedicated Plan panel in the sidebar.

### Data Model: Task Board

Stored as JSON at `.adorable/tasks.json` — structured for programmatic access:

```json
{
  "planId": "add-user-auth",
  "createdAt": "2026-03-29T12:00:00Z",
  "updatedAt": "2026-03-29T12:05:00Z",
  "tasks": [
    {
      "id": "task-1",
      "title": "Create AuthService",
      "description": "JWT login/register/logout with localStorage token management",
      "status": "completed",
      "assignedTo": "code-generator",
      "dependencies": [],
      "files": ["src/app/services/auth.service.ts"],
      "completedAt": "2026-03-29T12:02:00Z"
    },
    {
      "id": "task-2",
      "title": "Create LoginComponent",
      "description": "Email/password form, calls AuthService.login()",
      "status": "in-progress",
      "assignedTo": "code-generator",
      "dependencies": ["task-1"],
      "files": ["src/app/pages/login/login.component.ts", "src/app/pages/login/login.component.html"]
    },
    {
      "id": "task-3",
      "title": "Create AuthGuard",
      "status": "pending",
      "assignedTo": null,
      "dependencies": ["task-1"],
      "files": []
    },
    {
      "id": "task-4",
      "title": "Verify build passes",
      "status": "pending",
      "assignedTo": "build-fixer",
      "dependencies": ["task-1", "task-2", "task-3"],
      "files": []
    },
    {
      "id": "task-5",
      "title": "Visual verification",
      "status": "pending",
      "assignedTo": "visual-verifier",
      "dependencies": ["task-4"],
      "files": []
    }
  ]
}
```

### AI Tools for Plan & Task Management

New tools the AI can use to manage plans and tasks:

| Tool | Description |
|------|-------------|
| `create_plan` | Create a new plan at `.adorable/plans/current-plan.md` with goal, approach, and component list |
| `create_tasks` | Decompose a plan into tasks in `.adorable/tasks.json` with dependencies and assignments |
| `update_task` | Update a task's status (`pending` → `in-progress` → `completed` / `blocked`) |
| `get_tasks` | Read the current task board — used by worker agents to self-claim pending tasks |
| `claim_task` | Mark a task as `in-progress` and assign it to the current agent |
| `complete_task` | Mark a task as `completed` with the list of files modified |

These are thin wrappers around `read_file`/`write_file` targeting `.adorable/tasks.json`. The advantage of dedicated tools (vs. raw file operations) is:
- **Atomic updates**: Read-modify-write with JSON parsing, no risk of malformed JSON
- **Validation**: Enforce status transitions, dependency checking
- **Events**: Emit SSE events (`task_created`, `task_updated`) that the chat UI can react to

### In-Memory Task Coordination (Level 5)

For parallel agent teams (Level 5), the in-memory task list in `AgentLoopContext` provides fast coordination without file I/O:

```typescript
interface AgentTask {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  assignedTo: string | null;  // agentId
  dependencies: string[];     // task IDs
  files: string[];            // files to be modified (for locking)
  result?: string;            // summary of what was done
}

interface AgentLoopContext {
  // ... existing fields ...
  taskList?: AgentTask[];           // shared task board for agent teams
  fileLocks?: Map<string, string>;  // file path → agentId (prevents conflicts)
  agentId?: string;                 // this agent's ID
  agentRole?: string;               // this agent's role
}
```

The in-memory list is synced to `.adorable/tasks.json` periodically (or on completion) so the user can see progress.

### Chat UI: Plan & Task Visualization

The chat window can display plans and tasks with dedicated components:

**Plan Card** — rendered when the AI creates a plan:
```
┌─────────────────────────────────────────────┐
│ 📋 Plan: Add User Authentication            │
│                                             │
│ 5 tasks • 0 completed • 0 in progress       │
│                                             │
│ ▸ View full plan                            │
└─────────────────────────────────────────────┘
```

**Task Board** — shown during multi-agent execution:
```
┌─────────────────────────────────────────────┐
│ 📋 Task Board                    3/5 done   │
│                                             │
│ ✅ Create AuthService           code-gen     │
│ ✅ Create LoginComponent        code-gen     │
│ ✅ Create AuthGuard             code-gen     │
│ 🔄 Verify build                 build-fixer  │
│ ○  Visual verification         pending      │
│                                             │
└─────────────────────────────────────────────┘
```

**Key files for UI**:
- New `PlanCardComponent` in `apps/client/src/app/features/editor/chat/`
- New `TaskBoardComponent` in `apps/client/src/app/features/editor/chat/`
- Both rendered inline in the chat message list when plan/task events arrive via SSE

### SSE Protocol Extensions for Plans/Tasks

| Event Type | Payload | Purpose |
|-----------|---------|---------|
| `plan_created` | `{ planId, title, taskCount }` | AI created a new plan |
| `plan_updated` | `{ planId, status }` | Plan status changed |
| `task_created` | `{ taskId, title, assignedTo }` | New task added |
| `task_updated` | `{ taskId, status, assignedTo }` | Task status changed |
| `task_completed` | `{ taskId, files, summary }` | Task finished with results |

---

## Chat Window Visualization

Multi-agent work needs to be visible and understandable in the chat UI. Without good visualization, users won't know what's happening, why it's taking time, or what each agent contributed.

### Phase Progress Indicator

A horizontal stepper/progress bar at the top of the active generation, showing the current pipeline phase:

```
[ Research ] → [ Generate ] → [ Build ] → [ Review ] → [ Visual Verify ]
     ✓             ●            ○           ○              ○
```

- Completed phases show a checkmark
- Active phase pulses/animates
- Future phases are dimmed
- Clicking a phase scrolls to its messages in the chat

This gives an immediate sense of "where are we in the process?" and how much is left.

**Key files**: `apps/client/src/app/features/editor/chat/` — new component rendered above the active generation's messages.

### Agent Badges on Messages

Every message and tool call in the chat gets a small colored badge indicating which agent produced it:

```
🔍 Researcher    → blue
🔨 Code Generator → green
🏗️ Build Fixer    → orange
👁️ Visual Verifier → purple
📝 Reviewer       → teal
🎯 Orchestrator   → default/neutral
```

The badge appears as a small pill next to the agent's name/role, replacing the generic "Adorable AI" label during multi-agent runs. This makes it immediately clear who said/did what.

**Key files**: The existing `ChatMessageComponent` or equivalent needs a new `agentRole` property. The SSE stream protocol (`file_written`, `stream`, `tool_call`, `tool_result`, `status`) needs an optional `agent` field.

### Collapsible Agent Groups

Sub-agent work is grouped under a collapsible section:

```
▼ Research Phase (3 agents, 2.1s)
  │ 🔍 Agent 1: Reading app.ts, app.routes.ts, app.config.ts
  │ 🔍 Agent 2: Reading product-list.component.ts, product.service.ts
  │ 🔍 Agent 3: Reading shared styles, theme configuration
  │ Summary: Found 8 components, 3 services, routing uses lazy loading...

▼ Code Generation
  │ 🔨 Writing product-detail.component.ts
  │ 🔨 Writing product-detail.component.html
  │ ...

▶ Review Phase (1 agent, 1.3s)  ← collapsed by default
```

Collapsed by default for sub-phases (research, review) to keep the chat clean. The user can expand to see the detail. Shows timing for completed phases.

**Key files**: New wrapper component in the chat that groups messages by phase/agent. The server needs to emit phase start/end events via SSE.

### Parallel Execution Indicator

When multiple agents run concurrently, show a visual indicator that work is happening in parallel:

```
┌─────────────────────────────────────┐
│ ⚡ 3 agents working in parallel     │
│                                     │
│  🔍 Researcher 1  ████████░░  80%   │
│  🔍 Researcher 2  ██████░░░░  60%   │
│  🔍 Researcher 3  ████░░░░░░  40%   │
│                                     │
└─────────────────────────────────────┘
```

This makes it clear that parallelism is happening and provides a sense of progress. Each agent shows its current activity (reading file X, executing tool Y).

**Key files**: New component in the chat area. Requires the server to stream per-agent status updates via SSE (new event type `agent_status` with `{ agentId, role, status, progress }`).

### Agent Status Chips (Header Area)

Small status chips in the chat header or above the input area showing active agents:

```
┌─────────────────────────────────────────────────┐
│ 🔍 Researching...  🔨 Generating  📝 Reviewing  │
└─────────────────────────────────────────────────┘
```

Each chip shows the agent role and a brief status. Chips appear when an agent starts and disappear when it finishes. Clicking a chip scrolls to that agent's output in the chat.

**Key files**: `apps/client/src/app/features/editor/chat/chat.component.ts` — new signal tracking active agents, rendered above the message list.

### SSE Protocol Extensions

The existing SSE streaming protocol needs new event types to support multi-agent visualization:

| Event Type | Payload | Purpose |
|-----------|---------|---------|
| `phase_start` | `{ phase: string, agentCount: number }` | Signals the start of a pipeline phase |
| `phase_end` | `{ phase: string, duration: number }` | Signals phase completion |
| `agent_start` | `{ agentId: string, role: string, description: string }` | A sub-agent has started |
| `agent_status` | `{ agentId: string, status: string }` | Sub-agent status update |
| `agent_end` | `{ agentId: string, summary: string }` | Sub-agent completed |

Existing event types (`tool_call`, `tool_result`, `stream`, `file_written`) get an optional `agentId` field to associate them with a specific agent.

**Key files**:
- `apps/server/src/providers/base.ts` — emit new events via `callbacks`
- `apps/server/src/providers/types.ts` — extend `StreamCallbacks` interface
- `apps/server/src/routes/ai.routes.ts` — serialize new events to SSE
- `apps/client/src/app/core/services/project.ts` — parse new events from SSE stream
- `apps/client/src/app/features/editor/chat/` — render new UI components

### Implementation Order for Visualization

| Priority | Feature | Depends On |
|----------|---------|------------|
| 1 | Agent badges on messages | Level 1+ (any multi-agent) |
| 2 | Collapsible agent groups | Level 2+ (review agent) |
| 3 | Phase progress indicator | Level 3+ (research phase) |
| 4 | Parallel execution indicator | Level 3+ (parallel research) |
| 5 | Agent status chips | Level 4+ (specialized agents) |

Start with agent badges — they're useful even with just parallel tool execution (Level 1) and require minimal UI changes. The more complex visualizations (progress indicator, parallel indicator) become valuable as more agent phases are added.

---

## Verification

1. **Level 1**: Time a generation that involves 5+ file reads. Compare sequential vs parallel execution time. Verify all results are correctly ordered in the response.
2. **Level 2**: Generate a component, check that reviewer catches at least one issue. Verify reviewer output streams to UI.
3. **Level 3**: Compare total generation time with and without research phase. Check that the main agent skips file-reading turns when research context is provided.
4. **Level 4**: Verify each specialized agent only has access to its allowed tools. Check that the orchestrator correctly delegates and aggregates.
