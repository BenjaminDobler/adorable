# Provider Context Management Improvements

**Status:** Plan — ready for implementation
**Motivation:** A complex UI5 dashboard prompt consumed 95 turns (vs expected ~20), with 4 complete file-rewrite cycles, 35 file re-reads, and scope creep to 47 component docs when only 20 were needed. Root cause: the conversation history accumulates tool call/result pairs that exceed the context window, causing the AI to forget what it wrote, re-read, and rewrite from scratch in a death spiral.
**Related:** UI5 kit trace `anthropic_trace_b8d91480-769b-44aa-8e57-da867f803b68_2026-04-14T19-27-10-448Z.jsonl`

## The core problem

Adorable's agentic loop uses the **conversation as state**. Every tool call and result accumulates in the message history. A 20-file generation session can produce ~300K tokens of file content in the history, while the context window is ~128-200K. Old messages get pruned (replaced with `[truncated]`), which causes the AI to lose track of its own output, leading to re-reads and full rewrites.

**Current pruning** (`base.ts:304-358`): keeps the first message + last 6 messages, truncates everything in between by replacing file contents with `[truncated]` and trimming long strings. This is blunt — it discards useful information and provides no summary of what was lost.

## Improvements — ordered by priority

### 1. Session file tracker (inject "files you've written" summary)

**Problem:** After pruning, the AI doesn't know which files it created or modified. It calls `read_files` to re-discover its own output, wasting turns and tokens.

**Solution:** Maintain a running list of files written during the session. After each turn that includes file writes, inject a compact summary into the next tool result or as a system-level note.

**Implementation:**

`AgentLoopContext` already has `modifiedFiles: string[]` (types.ts:143). We just need to surface it to the AI.

In `anthropic.ts`, after appending tool results to messages (line 482), inject the session state if files have been written:

```typescript
// After line 482: messages.push({ role: 'user', content: toolResults });
if (ctx.modifiedFiles.length > 0) {
  const fileList = ctx.modifiedFiles.map(f => `  - ${f}`).join('\n');
  const sessionNote = `[Session state — ${ctx.modifiedFiles.length} files created/modified:\n${fileList}\nUse edit_file for changes to these files. Do NOT re-read files you just wrote unless checking specific content.]`;
  // Append as a text block to the last user message (tool results)
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
    lastMsg.content.push({ type: 'text', text: sessionNote });
  }
}
```

**Important:** Only inject after turns that included file writes (check if `modifiedFiles` grew this turn). Don't inject on every turn — that wastes tokens when the AI is just reading files.

**Also needed in `gemini.ts`** — same logic at the equivalent position in the Gemini agentic loop.

**Tokens:** ~200-400 per injection (for a 20-file list). Saves ~4,000-8,000 per re-read cycle avoided.

**Files to change:**
- `apps/server/src/providers/anthropic.ts` (~10 lines)
- `apps/server/src/providers/gemini.ts` (~10 lines)

---

### 2. Write-dedup warning

**Problem:** The AI calls `write_files` to rewrite files it already created instead of using `edit_file` for targeted changes. Each full rewrite costs ~2,000 output tokens per file. Four rewrites of 20 files = ~160,000 wasted output tokens.

**Solution:** In `tool-executor.ts`, when processing `write_file` or `write_files`, check if the file path is already in `ctx.modifiedFiles`. If so, append a warning to the tool result.

**Implementation:**

In `tool-executor.ts`, in the `write_file` handler (after line 127) and `write_files` handler (after the write loop ~line 170):

```typescript
// After writing the file(s), check for rewrites
const rewrittenPaths = writtenPaths.filter(p => previouslyWritten.has(p));
if (rewrittenPaths.length > 0) {
  const warning = `\n⚠ EFFICIENCY WARNING: You rewrote ${rewrittenPaths.length} file(s) that you already created earlier in this session: ${rewrittenPaths.join(', ')}. For future modifications, use edit_file with targeted old_str/new_str instead of rewriting entire files. This saves tokens and avoids context overflow.`;
  result += warning;
}
```

To track "previously written", add a `Set<string>` to `AgentLoopContext`:

```typescript
// In types.ts, add to AgentLoopContext:
writtenFilesSet: Set<string>;  // Tracks files written (for dedup warnings)
```

Initialize as `new Set()` in the provider. Update it in the write handlers alongside `modifiedFiles`.

**Files to change:**
- `apps/server/src/providers/types.ts` (~1 line)
- `apps/server/src/providers/anthropic.ts` (~1 line init)
- `apps/server/src/providers/gemini.ts` (~1 line init)
- `apps/server/src/providers/tool-executor.ts` (~15 lines)

---

### 3. Turn budget with progress warnings

**Problem:** The AI has no awareness of how many turns it has used or how many remain. It meanders, expanding scope and rewriting files, until it hits the hard limit (200 turns) or runs out of context.

**Solution:** Inject progress warnings at turn thresholds. These are injected as text blocks into the tool results message, similar to the session file tracker.

**Implementation:**

In the agentic loop (both `anthropic.ts` and `gemini.ts`), after the tool results are appended to messages, check turn count against thresholds:

```typescript
const turnsUsed = turnCount + 1;
const turnsRemaining = maxTurns - turnsUsed;
const filesWritten = ctx.modifiedFiles.length;

let progressNote = '';
if (turnsUsed === 25 && maxTurns > 30) {
  progressNote = `[Progress: ${turnsUsed} turns used, ${filesWritten} files written. Focus on completing the remaining work. Use edit_file for modifications, not full rewrites.]`;
} else if (turnsUsed === 35 && maxTurns > 40) {
  progressNote = `[Progress: ${turnsUsed} turns used. Approaching recommended limit. Verify your build and finalize. Do NOT start new rewrites.]`;
} else if (turnsRemaining <= 5 && turnsRemaining > 0) {
  progressNote = `[WARNING: Only ${turnsRemaining} turns remaining. Complete your work now — verify build, take a screenshot, and respond.]`;
}

if (progressNote) {
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
    lastMsg.content.push({ type: 'text', text: progressNote });
  }
}
```

**Thresholds are intentionally conservative** — the warnings come at 25 and 35 turns, not at 10 and 15. Simple prompts finish in 5-15 turns and never see these. Only complex sessions that are likely to spiral get the nudge.

**Files to change:**
- `apps/server/src/providers/anthropic.ts` (~15 lines)
- `apps/server/src/providers/gemini.ts` (~15 lines)

---

### 4. Plan-before-execute for complex prompts

**Problem:** The AI dives into writing code without a plan. For complex prompts (20+ files), this leads to scope creep, incomplete first drafts, and full rewrites when the AI realizes it forgot something.

**Solution:** When the preflight phase detects a complex prompt (many component names, explicit multi-file structure), inject a plan-generation instruction before the main loop. The AI outputs a plan (file list with brief descriptions), which becomes persistent context that's never truncated.

**Implementation:**

**Step 1 — Detect complexity in preflight:**

In `preflight.ts`, add a heuristic to the preflight decision:

```typescript
// Count component/file indicators in the prompt
const componentMentions = (prompt.match(/ui5-[a-z-]+|<[a-z]+-[a-z-]+>/gi) || []).length;
const fileIndicators = (prompt.match(/component|service|model|dialog|tab|page|route/gi) || []).length;
const isComplex = componentMentions > 10 || fileIndicators > 8;

// Add to PreflightDecision:
requiresPlan: isComplex;
```

**Step 2 — Inject plan instruction:**

In the provider (before the main loop), if `preflightDecision.requiresPlan`:

```typescript
if (preflightDecision.requiresPlan) {
  // Add plan instruction to the enriched message
  enrichedMessage += '\n\n**IMPORTANT — Plan first:** Before writing any code, output a structured plan:\n'
    + '1. List every file you will create (path + one-line description)\n'
    + '2. List the components/services and what each does\n'
    + '3. List the order you will write them (dependencies first)\n'
    + 'Then wait for confirmation before proceeding. Do NOT write any files in this turn.\n';
}
```

**Step 3 — Pin the plan:**

After the first AI response (which should be the plan), extract it and store it in `AgentLoopContext`:

```typescript
// In AgentLoopContext:
generationPlan?: string;  // Persisted plan from the first turn
```

Inject the plan into the pruneMessages logic so it's never truncated — always keep it as the second message (after the initial prompt).

**Files to change:**
- `apps/server/src/providers/types.ts` (~2 lines)
- `apps/server/src/providers/preflight.ts` (~10 lines)
- `apps/server/src/providers/anthropic.ts` (~20 lines)
- `apps/server/src/providers/gemini.ts` (~20 lines)
- `apps/server/src/providers/base.ts` (~5 lines — pin plan in pruneMessages)

---

### 5. Conversation summarization before truncation

**Problem:** Current pruning (`base.ts:pruneMessages`) replaces middle messages with `[truncated]`, losing all information about what the AI did, what decisions it made, and what files it wrote. The AI then wastes turns re-discovering this information.

**Solution:** Before pruning, ask a fast model (Haiku/Flash) to summarize the messages that are about to be truncated. Replace the truncated block with the summary instead of `[truncated]`.

**Implementation:**

**Step 1 — Detect when summarization is needed:**

In `pruneMessages`, before truncating, check if the messages being removed contain significant work:

```typescript
const messagesToPrune = messages.slice(1, -keepRecentCount);
const hasSignificantWork = messagesToPrune.some(m =>
  JSON.stringify(m).includes('write_file') || JSON.stringify(m).includes('edit_file')
);
```

**Step 2 — Call summarization:**

If significant work is being pruned, call a fast model:

```typescript
if (hasSignificantWork && this.summarizeContext) {
  const summary = await this.summarizeContext(messagesToPrune);
  // Replace pruned messages with a single summary message
  messages.splice(1, messagesToPrune.length,
    { role: 'user', content: [{ type: 'text', text: `[Summary of earlier work: ${summary}]` }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Understood, continuing from where I left off.' }] }
  );
  return; // Skip normal truncation
}
```

**Step 3 — Implement the summarizer:**

Add a method to `BaseLLMProvider` or as a standalone function:

```typescript
protected async summarizeContext(messages: any[]): Promise<string> {
  const prompt = 'Summarize the work done in these conversation turns. Include: '
    + '(1) files created/modified with paths, '
    + '(2) key decisions made, '
    + '(3) current status (what works, what remains). '
    + 'Be concise — under 500 tokens.';

  // Call Haiku/Flash for speed and cost
  return await this.quickLLMCall(prompt, messages);
}
```

**Cost:** ~0.5K input tokens + ~500 output tokens per summarization = ~$0.001 per call. Negligible.

**Risk:** Adds latency (~1-2 seconds for a Haiku call). Mitigate by only triggering when >20 messages are being pruned (i.e., a genuinely long session).

**Files to change:**
- `apps/server/src/providers/base.ts` (~40 lines — summarization logic + pruneMessages refactor)
- `apps/server/src/providers/anthropic.ts` (~10 lines — implement `quickLLMCall`)
- `apps/server/src/providers/gemini.ts` (~10 lines — implement `quickLLMCall`)

---

### 6. Diff-based file editing (longer-term)

**Problem:** `write_files` sends the complete file content every time, even for small changes. A 200-line file modified in 3 places costs ~200 lines of output. With SEARCH/REPLACE diffs, it would cost ~30 lines.

**Solution:** Add a `patch_files` tool that accepts SEARCH/REPLACE blocks (like Aider's format). The server applies the patches to the files on disk. The AI sends only the changed portions.

**Implementation sketch:**

**New tool definition (tools.ts):**

```typescript
{
  name: 'patch_files',
  description: 'Apply targeted changes to multiple files using SEARCH/REPLACE blocks. '
    + 'More efficient than write_files for modifications. Each patch specifies the file '
    + 'path and one or more SEARCH/REPLACE pairs.',
  input_schema: {
    type: 'object',
    properties: {
      patches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            changes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  search: { type: 'string', description: 'Exact string to find (must be unique in the file)' },
                  replace: { type: 'string', description: 'Replacement string' }
                },
                required: ['search', 'replace']
              }
            }
          },
          required: ['path', 'changes']
        }
      }
    },
    required: ['patches']
  }
}
```

**Tool executor:** Apply each search/replace in order, similar to `edit_file` but batched across multiple files.

**System prompt addition:** "Prefer `patch_files` for modifications to files you've already created. Use `write_files` only for new files."

**Risk:** LLMs sometimes generate incorrect SEARCH strings (whitespace mismatches, truncated matches). Need robust error handling with "did you mean..." suggestions. The existing `edit_file` tool has the same challenge — study its error handling patterns.

**Deferred** because it's the most invasive change and the other 5 improvements address the immediate problems. Implement after 1-5 are stable.

**Files to change:**
- `apps/server/src/providers/tools.ts` (~30 lines)
- `apps/server/src/providers/tool-executor.ts` (~50 lines)
- `apps/server/src/providers/system-prompts.ts` (~5 lines)

---

## Implementation order

| # | Improvement | Effort | Impact | Dependencies |
|---|---|---|---|---|
| **1** | Session file tracker | ~30 min | High | None |
| **2** | Write-dedup warning | ~30 min | High | None |
| **3** | Turn budget warnings | ~30 min | Medium | None |
| **4** | Plan-before-execute | ~2 hours | High | None (but benefits from 1-3) |
| **5** | Conversation summarization | ~4 hours | High | Needs quickLLMCall in both providers |
| **6** | Diff-based editing | ~1 day | Highest (long-term) | Stable after 1-5 |

**Recommended:** Implement 1-3 together in a single commit (~1.5 hours). Test on the complex prompt. Then implement 4-5 in a second commit. Defer 6.

## Expected impact

With improvements 1-4 applied, the 95-turn dashboard generation should become ~20-25 turns:

| Phase | Before | After |
|---|---|---|
| Read docs + plan | 6 turns (with scope creep) | 6 turns (scoped to plan) |
| Write 20 files | 7 turns × 4 cycles = 28 | 8 turns × 1 cycle = 8 |
| Re-read own output | 15 turns | 0 (session tracker eliminates) |
| Fix/edit | 10 turns | 4 turns (edit_file, not rewrite) |
| Build + verify | 15 turns | 3 turns |
| Debug preview | 21 turns | 2 turns (preview fix landed) |
| **Total** | **95** | **~23** |

Token savings: ~80% reduction in output tokens (no rewrites), ~70% reduction in input tokens (no re-reads). Cost per complex generation: ~$2-3 → ~$0.50.

## Files likely to change

- `apps/server/src/providers/types.ts` — add `writtenFilesSet`, `generationPlan` to AgentLoopContext
- `apps/server/src/providers/anthropic.ts` — session tracker injection, turn budget, plan phase
- `apps/server/src/providers/gemini.ts` — same as anthropic
- `apps/server/src/providers/tool-executor.ts` — write-dedup warning
- `apps/server/src/providers/base.ts` — summarization in pruneMessages, pin plan
- `apps/server/src/providers/preflight.ts` — complexity detection for plan trigger
- `apps/server/src/providers/tools.ts` — patch_files tool (improvement 6 only)
- `apps/server/src/providers/system-prompts.ts` — edit_file preference strengthening

## How other tools solve this (reference)

| Tool | Context strategy | Key technique |
|---|---|---|
| **Cursor** | Plan-then-execute, isolated calls per file | Each file edit is a separate LLM call with ~5K context |
| **Aider** | Diff-based editing + repo map | SEARCH/REPLACE format, tree-sitter codebase summary |
| **Claude Code** | Automatic message compression | Summarizes old messages before they're truncated |
| **Devin / SWE-Agent** | External working memory + state machine | Scratchpad persists across turns, explicit phases |
| **Adorable (current)** | Blunt truncation | Replaces old messages with `[truncated]` |
| **Adorable (proposed)** | Session tracker + dedup + budget + plan + summarization | Hybrid of Claude Code's compression + Cursor's planning |
