# Tool Improvements Plan

**Status:** Plan — ready for incremental implementation
**Prerequisite:** Tool architecture refactor is complete (`providers/tools/` with modular tool files)
**Reference:** Analysis of Claude Code's tool implementations for patterns worth adopting

## Overview

This plan covers improvements to Adorable's tools in 4 phases, ordered by impact-to-effort ratio. Each improvement is independent — they can be implemented in any order within a phase, and phases can overlap.

The improvements fall into three categories:
1. **Robustness** — input validation, staleness detection, error recovery
2. **Expressiveness** — richer schemas, output modes, pagination
3. **DX & infrastructure** — Zod migration, typed args, activity descriptions

---

## Phase 1 — High impact, low effort (~1-2 days total)

### 1.1 Input validation for edit-file and write-file

**Problem:** `edit_file` and `write_file` have no pre-execution validation. The AI can try to edit a file that changed since it was last read (stale content), attempt to replace a string that doesn't exist (wastes a turn on the error), or edit a file it never read (blind edit).

**What to add:**

For `edit-file`:
- **Staleness check** — track when each file was last read (path → mtime + content hash in `AgentLoopContext`). Before applying the edit, verify the file hasn't been modified externally since the AI last read it. If stale, return an error: "File has been modified since you last read it. Re-read it first."
- **String-exists pre-check** — before calling `fs.editFile`, verify `old_str` exists in the current file content. If not, provide fuzzy match suggestions (the filesystem layer already does this, but doing it in the tool lets us add more context).
- **Read prerequisite** — track which files the AI has read in this session (via a `Set<string>` on ctx). If the AI tries to edit a file it hasn't read, return: "You must read this file first before editing it."

For `write-file`:
- **Staleness check** — same as edit-file. If the AI writes a file that was modified externally since it was read, warn (don't block, since write is a full overwrite).
- **Partial-read guard** — if the AI read only part of a file (offset/limit), warn when it tries to write_file (it might be overwriting content it didn't see).

**Implementation:**

Add to `AgentLoopContext`:
```typescript
readFileState: Map<string, { mtime: number; contentHash: string; partial: boolean }>;
```

Add a `validateInput` step in each tool's `execute` before the actual operation:
```typescript
async execute(args, ctx) {
  const validation = await this.validateInput(args, ctx);
  if (!validation.ok) return { content: validation.message, isError: true };
  // ... proceed with edit
}
```

**Files to change:**
- `providers/tools/types.ts` — add `validateInput?` to Tool interface
- `providers/types.ts` — add `readFileState` to AgentLoopContext
- `providers/tools/filesystem/read-file.ts` — track reads in `readFileState`
- `providers/tools/filesystem/read-files.ts` — track reads in `readFileState`
- `providers/tools/filesystem/edit-file.ts` — add staleness + prerequisite checks
- `providers/tools/filesystem/write-file.ts` — add staleness check
- `providers/anthropic.ts` — initialize `readFileState: new Map()`
- `providers/gemini.ts` — initialize `readFileState: new Map()`

**Estimated effort:** ~2-3 hours

---

### 1.2 Path validation for glob, grep, list-dir

**Problem:** When the AI passes a non-existent path to `glob` or `grep`, it gets an unhelpful empty result. Claude Code validates paths upfront and provides "did you mean..." suggestions.

**What to add:**

For `glob`:
- Validate that the implicit search directory exists
- If the pattern includes a directory prefix that doesn't exist, suggest alternatives

For `grep`:
- Validate `args.path` exists if provided
- If it's a file, verify it exists; if it's a directory, verify it's accessible

For `list-dir`:
- Validate directory exists
- If not, suggest similar directory names (e.g., "did you mean `src/app/components/` instead of `src/app/component/`?")

**Implementation:** Add path checks at the top of each tool's `execute`. Use the filesystem's `listDir` on the parent directory to find similar names for suggestions.

**Files to change:**
- `providers/tools/filesystem/glob.ts`
- `providers/tools/filesystem/grep.ts`
- `providers/tools/filesystem/list-dir.ts`

**Estimated effort:** ~1 hour

---

### 1.3 Output pagination for grep and glob

**Problem:** When grep/glob return hundreds of results, the full list floods the context window. Claude Code supports `head_limit` + `offset` parameters with explicit truncation reporting.

**What to add:**

For both `grep` and `glob`:
- Add optional `head_limit` parameter (default: 100 for glob, 250 for grep)
- Add optional `offset` parameter (default: 0)
- Apply limit after collecting results
- Report truncation in the output: "Showing 100 of 347 results. Use offset=100 to see more."

**Schema additions:**
```typescript
head_limit: { type: 'number', description: 'Max results to return (default 100)' },
offset: { type: 'number', description: 'Skip first N results (for pagination)' },
```

**Files to change:**
- `providers/tools/filesystem/grep.ts` — add limit/offset to schema + execute
- `providers/tools/filesystem/glob.ts` — add limit/offset to schema + execute

**Estimated effort:** ~1-2 hours

---

### 1.4 Multiple output modes for grep

**Problem:** Grep always returns matching lines. Sometimes the AI just needs filenames (to decide which to read), or match counts (to gauge scope). Currently it gets everything, wasting tokens.

**What to add:**

Three modes via an `output_mode` parameter:
- `content` (default) — matching lines with context (current behavior)
- `files_with_matches` — just file paths containing matches
- `count` — match count per file

**Schema addition:**
```typescript
output_mode: {
  type: 'string',
  enum: ['content', 'files_with_matches', 'count'],
  description: 'Output format: content (matching lines), files_with_matches (file paths only), count (match counts per file)'
},
```

**Files to change:**
- `providers/tools/filesystem/grep.ts` — add mode to schema + execute
- `providers/filesystem/disk-filesystem.ts` — extend `grep` to support modes (may need different `rg` flags)

**Estimated effort:** ~2 hours

---

### 1.5 Path relativization in results

**Problem:** Tool results return absolute paths, which waste tokens. Converting to relative paths (relative to project root) saves tokens and is more readable.

**What to add:** In grep, glob, and list-dir results, strip the project root prefix from paths before returning.

**Implementation:** The filesystem already knows its `basePath`. Use it to relativize all paths in results.

**Files to change:**
- `providers/tools/filesystem/grep.ts`
- `providers/tools/filesystem/glob.ts`
- `providers/tools/filesystem/list-dir.ts`

**Estimated effort:** ~30 minutes

---

## Phase 2 — Medium impact, medium effort (~3-5 days total)

### 2.1 Migrate to Zod schemas

**Problem:** Tool schemas are raw JSON objects (`Record<string, unknown>`) with no runtime validation and no type safety. The `execute` function receives `args: any`.

**What to add:**

Replace raw JSON schemas with Zod:
```typescript
// Before
definition: {
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '...' }
    },
    required: ['path']
  }
}

// After
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const inputSchema = z.object({
  path: z.string().describe('The path to the file to read.'),
});
type Input = z.infer<typeof inputSchema>;

definition: {
  input_schema: zodToJsonSchema(inputSchema),  // auto-generated for LLM
}

async execute(rawArgs: unknown, ctx: AgentLoopContext) {
  const args = inputSchema.parse(rawArgs);  // runtime validation + typed
  // args.path is now `string`, not `any`
}
```

**Benefits:**
- Runtime validation catches malformed LLM input at the boundary
- `args` is typed — no more `args.paht` typos
- Schema and validation in one place (Zod)
- JSON schema auto-generated from Zod for the LLM
- Custom transformers possible (semantic numbers, etc.)

**Migration strategy:**
1. Add `zod` and `zod-to-json-schema` as dependencies
2. Convert one tool at a time (start with simple ones like `read-file`, `list-dir`)
3. The old `input_schema` JSON stays as a fallback until all tools are converted
4. Add a helper in `types.ts` that converts Zod → JSON schema transparently

**Files to change:**
- `package.json` — add zod + zod-to-json-schema deps
- `providers/tools/types.ts` — update ToolDefinition to accept Zod or JSON
- Each tool file — convert schema (one by one)

**Estimated effort:** ~1 day (for all ~45 tools, mostly mechanical)

---

### 2.2 Semantic input validators

**Problem:** LLMs sometimes send numbers as strings (`"10"` instead of `10`), booleans as strings (`"true"` instead of `true`), or natural language (`"yes"`, `"no"`). Currently these silently fail or produce unexpected behavior.

**What to add:**

Custom Zod transformers:
```typescript
// Accepts: 10, "10", "ten"
const semanticNumber = (schema: z.ZodOptional<z.ZodNumber>) =>
  z.union([schema, z.string()]).transform(v => {
    if (typeof v === 'number') return v;
    const n = parseInt(v, 10);
    return isNaN(n) ? undefined : n;
  });

// Accepts: true, false, "true", "false", "yes", "no", 0, 1
const semanticBoolean = (schema: z.ZodOptional<z.ZodBoolean>) =>
  z.union([schema, z.string(), z.number()]).transform(v => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return ['true', 'yes', '1', 'on'].includes(String(v).toLowerCase());
  });
```

**Where to use:**
- `grep`: `-B`, `-A`, `-C`, `head_limit`, `offset` → semanticNumber; `-i`, `-n`, `multiline` → semanticBoolean
- `glob`: `head_limit` → semanticNumber
- `browse_screenshot`: `quality` → semanticNumber; `fullResolution` → semanticBoolean
- All tools with optional boolean flags

**Files to change:**
- `providers/tools/utils.ts` — add semanticNumber, semanticBoolean
- Each tool that has numeric/boolean optional params

**Estimated effort:** ~2-3 hours (after Zod migration)

---

### 2.3 Structured diff output for edits

**Problem:** `edit_file` and `patch_files` return "File edited successfully." — the AI has no visibility into what actually changed. Claude Code returns structured patch hunks with line numbers.

**What to add:**

After applying an edit, compute a simple diff:
```typescript
return {
  content: `File edited successfully.\n\nChanges:\n` +
    `- Lines ${startLine}-${endLine}: replaced ${oldLines} lines with ${newLines} lines\n` +
    `- Removed: ${oldStr.split('\n').length} lines\n` +
    `- Added: ${newStr.split('\n').length} lines`,
  isError: false,
};
```

Or more structured:
```typescript
const patch = createPatch(args.path, oldContent, newContent);
return {
  content: `File edited successfully.\n\n\`\`\`diff\n${patch}\n\`\`\``,
  isError: false,
};
```

**Files to change:**
- `providers/tools/filesystem/edit-file.ts`
- `providers/tools/filesystem/patch-files.ts`

**Estimated effort:** ~3-4 hours

---

### 2.4 Quote normalization in edit-file

**Problem:** Files may contain curly quotes (`'`, `'`, `"`, `"`) while the AI sends straight quotes (`'`, `"`). The `old_str` match fails even though the content is semantically identical.

**What to add:**

A `normalizeQuotes` function that converts curly → straight quotes for matching purposes:
```typescript
function normalizeQuotes(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")   // curly single quotes
    .replace(/[\u201C\u201D]/g, '"');   // curly double quotes
}
```

In `edit-file.ts`, if the exact match fails, try matching with normalized quotes. If that succeeds, apply the edit using the actual (curly) quotes from the file.

**Files to change:**
- `providers/tools/filesystem/edit-file.ts`
- Potentially `providers/filesystem/disk-filesystem.ts` (if the normalization should be in the filesystem layer)

**Estimated effort:** ~1-2 hours

---

### 2.5 Activity descriptions for UI spinners

**Problem:** When tools are executing, the UI shows a generic spinner. Claude Code shows contextual descriptions like "Reading src/app.ts", "Searching for 'UserService'", "Writing 3 files".

**What to add:**

A `getActivityDescription` method on each tool:
```typescript
export interface Tool {
  definition: ToolDefinition;
  execute: (args: any, ctx: AgentLoopContext) => Promise<ToolResult>;
  getActivityDescription?: (args: any) => string;
}
```

Examples:
- `read-file`: `"Reading ${args.path}"`
- `write-files`: `"Writing ${args.files.length} files"`
- `grep`: `"Searching for '${args.pattern}'"`
- `verify-build`: `"Verifying build..."`
- `browse-screenshot`: `"Capturing screenshot"`
- `edit-file`: `"Editing ${args.path}"`

The provider passes this to `callbacks.onToolStart` so the client can show it.

**Files to change:**
- `providers/tools/types.ts` — add `getActivityDescription?` to Tool interface
- Each tool file — add the description function
- `providers/base.ts` — pass description to `callbacks.onToolStart`
- Client-side spinner component — display the description

**Estimated effort:** ~2-3 hours (server + client)

---

## Phase 3 — Medium impact, higher effort (~1-2 weeks)

### 3.1 Skill discovery on file edit

**Problem:** When the AI edits a file in a directory that has contextual skills or kit docs, it doesn't automatically load them. Claude Code discovers and activates skills based on file paths.

**What to add:**

When `edit-file` or `write-file` creates/modifies a file, check if there are contextual skills or kit docs relevant to that file's directory:

```typescript
// After successful edit/write
const relevantSkills = await skillRegistry.discoverForPath(args.path);
if (relevantSkills.length > 0) {
  // Inject skill instructions into the next turn
  ctx.pendingSkillInjections.push(...relevantSkills);
}
```

For example, if the AI edits `src/app/components/shell/shell.component.ts` in a UI5 project, the system could auto-inject the shellbar component docs.

**Files to change:**
- `providers/tools/filesystem/edit-file.ts`
- `providers/tools/filesystem/write-file.ts`
- `providers/tools/filesystem/write-files.ts`
- `providers/skills/skill-registry.ts` — add `discoverForPath` method
- `providers/types.ts` — add `pendingSkillInjections` to AgentLoopContext

**Estimated effort:** ~1 day

---

### 3.2 LSP integration on file changes

**Problem:** After editing a file, the AI has no real-time feedback on whether the edit introduced type errors or template issues. It has to run a full build to find out.

**What to add:**

Notify the Angular language server (via LSP) when files change:
```typescript
// After edit/write
if (ctx.lspManager) {
  ctx.lspManager.notifyDidChange(args.path, newContent);
  ctx.lspManager.notifyDidSave(args.path);
  // Optionally: wait for diagnostics and include them in the result
  const diagnostics = await ctx.lspManager.getDiagnostics(args.path);
  if (diagnostics.length > 0) {
    content += `\n\nDiagnostics:\n${diagnostics.map(d => `  ${d.severity}: ${d.message} (line ${d.line})`).join('\n')}`;
  }
}
```

This would catch type errors, missing imports, and template issues immediately after each edit — without running a full build.

**Prerequisite:** Angular language server integration in the desktop/container environment.

**Files to change:**
- New service: `services/lsp-manager.ts`
- `providers/types.ts` — add `lspManager?` to AgentLoopContext
- `providers/tools/filesystem/edit-file.ts` — notify LSP after edit
- `providers/tools/filesystem/write-file.ts` — notify LSP after write

**Estimated effort:** ~2-3 days (depends on Angular LSP setup complexity)

---

### 3.3 File history tracking for undo

**Problem:** There's no way to undo an edit. If the AI makes a destructive change, the only recovery is git checkout.

**What to add:**

Before each edit/write, save the previous content to a history store:
```typescript
// Before applying edit
const previousContent = await ctx.fs.readFile(args.path);
const hash = crypto.createHash('sha256').update(previousContent).digest('hex');
ctx.fileHistory.set(args.path, { content: previousContent, hash, timestamp: Date.now() });
```

Add an `undo_edit` tool that restores the previous version:
```typescript
export const undoEdit: Tool = {
  definition: {
    name: 'undo_edit',
    description: 'Restore a file to its state before the last edit.',
    input_schema: { ... }
  },
  async execute(args, ctx) {
    const history = ctx.fileHistory.get(args.path);
    if (!history) return { content: 'No edit history for this file.', isError: true };
    await ctx.fs.writeFile(args.path, history.content);
    return { content: `Restored ${args.path} to previous state.`, isError: false };
  }
};
```

**Files to change:**
- `providers/types.ts` — add `fileHistory` to AgentLoopContext
- `providers/tools/filesystem/edit-file.ts` — save history before edit
- `providers/tools/filesystem/write-file.ts` — save history before overwrite
- New tool: `providers/tools/filesystem/undo-edit.ts`

**Estimated effort:** ~4 hours

---

## Phase 4 — Lower priority / polish (~1-2 weeks)

### 4.1 Permission rule matching per tool

**Problem:** Adorable has no per-tool permission system. All tools are either available or not, with no fine-grained control over what inputs they accept.

**What to add:**

A permission layer that allows rules like:
- `"edit_file": "src/**/*.ts"` — allow editing only TypeScript files in src
- `"run_command": "npm test"` — allow only specific commands
- `"grep": "!node_modules"` — prevent searching in node_modules

Each tool would implement a `preparePermissionMatcher` that defines how rules apply to its inputs:
```typescript
preparePermissionMatcher(args) {
  return (pattern: string) => matchWildcardPattern(pattern, args.path);
}
```

**This is a significant feature that needs design discussion** — it involves UI for configuring rules, storage, and enforcement. Document as a future feature.

**Estimated effort:** ~3-5 days

---

### 4.2 Search/read command detection for run-command

**Problem:** The UI treats all `run_command` calls the same. But `grep`, `cat`, `ls` are read-only and safe to collapse in the UI, while `rm`, `npm install`, `git push` are mutations that should be visible.

**What to add:**

Categorize commands by their nature:
```typescript
const SEARCH_COMMANDS = new Set(['find', 'grep', 'rg', 'ag', 'ack', 'locate', 'which', 'whereis']);
const READ_COMMANDS = new Set(['cat', 'head', 'tail', 'less', 'wc', 'stat', 'file', 'jq', 'awk', 'sort']);
const LIST_COMMANDS = new Set(['ls', 'tree', 'du']);

function categorizeCommand(command: string): 'search' | 'read' | 'list' | 'mutation' {
  const firstWord = command.trim().split(/\s+/)[0];
  if (SEARCH_COMMANDS.has(firstWord)) return 'search';
  if (READ_COMMANDS.has(firstWord)) return 'read';
  if (LIST_COMMANDS.has(firstWord)) return 'list';
  return 'mutation';
}
```

Return this category in the tool result metadata so the client can adjust the UI (collapse read-only commands, highlight mutations).

**Files to change:**
- `providers/tools/build/run-command.ts` — add command categorization
- Client-side tool result rendering — use category for UI decisions

**Estimated effort:** ~2-3 hours

---

### 4.3 Tool-specific concurrency flags based on input

**Problem:** The `isReadOnly` flag is static per tool definition. But some tools are read-only for some inputs and mutating for others. For example, `inject_css` with `action: 'add'` is a mutation, but with `action: 'clear'` could be considered a reset.

**What to add:**

Make `isReadOnly` a function that receives the input:
```typescript
export interface Tool {
  definition: ToolDefinition;
  execute: (args: any, ctx: AgentLoopContext) => Promise<ToolResult>;
  isReadOnly?: (args: any) => boolean;    // replaces static flag
  isDestructive?: (args: any) => boolean; // new: marks dangerous operations
}
```

Update the parallel execution logic in `base.ts` to call the function if available, falling back to the static flag.

**Files to change:**
- `providers/tools/types.ts` — add dynamic `isReadOnly` and `isDestructive`
- `providers/base.ts` — update parallel execution check
- Selected tool files — implement dynamic checks where relevant

**Estimated effort:** ~2 hours

---

### 4.4 VCS directory auto-exclusion

**Problem:** `grep` and `glob` can match files inside `.git/`, `.svn/`, or other VCS directories, returning noisy results.

**What to add:**

Auto-exclude VCS directories from search results:
```typescript
const VCS_DIRS = ['.git', '.svn', '.hg', '.bzr', '.jj'];
```

For grep, add `--glob '!.git'` (or equivalent) to the underlying search command. For glob, filter results that contain VCS directory segments.

**Files to change:**
- `providers/tools/filesystem/grep.ts`
- `providers/tools/filesystem/glob.ts`
- Potentially `providers/filesystem/disk-filesystem.ts`

**Estimated effort:** ~1 hour

---

## Implementation checklist

### Phase 1 (~1-2 days) ✅ DONE
- [x] 1.1 Input validation for edit-file and write-file (staleness + prerequisite)
- [x] 1.2 Path validation for glob, grep, list-dir
- [x] 1.3 Output pagination for grep and glob
- [x] 1.4 Multiple output modes for grep
- [x] 1.5 Path relativization in results (already relative — no change needed)

### Phase 2 (~3-5 days) ✅ DONE
- [x] 2.1 Migrate to Zod schemas (infrastructure + core tools: grep, glob, read-file, list-dir)
- [x] 2.2 Semantic input validators (semanticNumber, semanticBoolean)
- [x] 2.3 Structured diff output for edits
- [x] 2.4 Quote normalization in edit-file
- [x] 2.5 Activity descriptions for UI spinners

### Phase 3 (~1-2 weeks) — partially done
- [x] 3.1 Skill discovery on file edit
- [ ] 3.2 LSP integration on file changes (needs Angular LS setup — 2-3 days)
- [x] 3.3 File history tracking for undo

### Phase 4 (~1-2 weeks) — partially done
- [ ] 4.1 Permission rule matching per tool (needs UI design — 3-5 days)
- [x] 4.2 Search/read command detection for run-command
- [x] 4.3 Tool-specific concurrency flags based on input (getActivityDescription added; dynamic isReadOnly deferred)
- [x] 4.4 VCS directory auto-exclusion

## Files reference

- Tool architecture: `apps/server/src/providers/tools/` (modular tool files)
- Tool types: `apps/server/src/providers/tools/types.ts`
- Tool registry: `apps/server/src/providers/tools/index.ts`
- Tool utilities: `apps/server/src/providers/tools/utils.ts`
- Agent loop context: `apps/server/src/providers/types.ts`
- Provider loop: `apps/server/src/providers/anthropic.ts`, `gemini.ts`
- Base provider: `apps/server/src/providers/base.ts`
- Filesystem: `apps/server/src/providers/filesystem/disk-filesystem.ts`
- Zod helpers: `apps/server/src/providers/tools/zod-helpers.ts`
- Skill discovery: `apps/server/src/providers/tools/filesystem/skill-discovery.ts`
- Undo tool: `apps/server/src/providers/tools/filesystem/undo-edit.ts`
- Companion docs: `internal-docs/tool-architecture-refactor.md`, `internal-docs/provider-context-management-improvements.md`
