# Analyze AI Generation Session

You are analyzing an Adorable AI generation session from its debug log. Your job is to parse the JSONL trace file, identify patterns, flag anti-patterns, and produce an actionable report.

## Step 1: Locate the Log File

List files in the `debug_logs/` directory:
```
ls -lt debug_logs/*.jsonl | head -30
```

The naming convention is:
- `{provider}_trace_{timestamp}.jsonl` — standalone trace
- `{provider}_trace_{projectId}_{timestamp}.jsonl` — project-scoped trace
- `router_trace_{timestamp}.jsonl` — SmartRouter decision logs

Providers: `anthropic`, `gemini`, `router`

If the user specified a file or project ID, use that. Otherwise, ask which file to analyze, or offer to use the most recent `anthropic_trace_*.jsonl` or `gemini_trace_*.jsonl` file (skip `router_trace_` files unless specifically requested — those contain only routing decisions, not full session traces).

## Step 2: Parse the JSONL

Read the selected file. Each line is a JSON object with `{ timestamp, type, data }`.

Extract and categorize every entry by its `type` field. Here are all known event types:

### Session Metadata
| Type | What it contains |
|------|-----------------|
| `INIT` | `data.provider`, `data.timestamp` — which provider, when |
| `START` | `data.model`, `data.promptLength`, `data.totalMessageLength` — model used, context sizes |

### Context Injection
| Type | What it contains |
|------|-----------------|
| `SYSTEM_PROMPT` | `data.text`, `data.length` — the full system prompt sent to the model |
| `KNOWLEDGE_BASE` | `data.text`, `data.length` — Angular knowledge base injected |
| `USER_MESSAGE` | `data.text`, `data.length` — the user's prompt + file structure + kit catalog appended |

### Kit / Component Library
| Type | What it contains |
|------|-----------------|
| `KIT_CATALOG_INJECTED` | `data.kitName`, `data.catalogLength`, `data.docFiles` — component catalog was available |
| `KIT_CATALOG_EMPTY` | `data.kitName`, `data.hasStorybookResource`, `data.storybookStatus`, `data.selectedComponentCount`, `data.docFilesInjected` — no catalog generated (check why) |
| `KIT_DOC_FILES_INJECTED` | `data.kitName`, `data.docFiles` — how many `.adorable/components/*.md` doc files were injected into the filesystem |

### MCP Tools
| Type | What it contains |
|------|-----------------|
| `MCP_INITIALIZED` | `data.toolCount`, `data.serverCount` — external MCP tools available |
| `MCP_INIT_ERROR` | `data.error` — MCP initialization failed |

### Agentic Loop
| Type | What it contains |
|------|-----------------|
| `TURN_START` | `data.turn` — turn number (0-indexed) |
| `ASSISTANT_RESPONSE` | `data.turn`, `data.text`, `data.length` — what the model said/planned |
| `EXECUTING_TOOL` | `data.name`, `data.args` — tool call being executed (read_file, write_files, run_command, edit_file, list_dir, etc.) |
| `TOOL_RESULT` | `data.id`, `data.isError`, `data.text`, `data.length` — tool output; check `isError` for failures |
| `INJECTED_USER_MESSAGE` | `data.text`, `data.reason` — system-injected message (e.g., `auto_build_failure` after failed build) |
| `BUILD_FAILURE_NUDGE` | `data.text`, `data.failedBuildCount`, `data.activeKitName` — escalation message after repeated build failures |

### Router (only in router_trace files)
| Type | What it contains |
|------|-----------------|
| `ROUTING_DECISION` | `data.reason`, `data.provider`, `data.model` — why a provider was chosen |
| `ROUTING_FALLBACK` | `data.reason`, `data.provider`, `data.model` — fallback triggered |
| `CLASSIFYING_START` | `data.routerModel` — classification started |
| `CLASSIFIED` | `data.classification` — task classification result |
| `ROUTING_ERROR` | `data.error` — routing failed |

## Step 3: Build the Analysis

Once parsed, analyze the session across these dimensions:

### 3a. Session Overview
- Provider and model used
- Total turns taken
- Total duration (first timestamp to last timestamp)
- User prompt summary (first ~100 chars of the user message text)
- System prompt size and knowledge base size

### 3b. Tool Usage Summary
Build a table of every tool call:
- Tool name
- Count of calls
- Error count
- List specific files read and written

Flag these patterns:
- **File churn**: same file path appearing in 3+ `write_files`/`write_file`/`edit_file` calls — the model kept rewriting instead of getting it right
- **Read-after-write loops**: writing a file then immediately reading it back (wasteful)
- **Exploration waste**: `list_dir` or `read_files` calls into `node_modules/`, `dist/`, or other non-source directories when `.adorable/` docs were available

### 3c. Kit Compliance
If `KIT_CATALOG_INJECTED` or `KIT_DOC_FILES_INJECTED` is present:
- Did the model read `.adorable/components/*.md` docs BEFORE writing component code?
- Did it read `.adorable/COMPONENTS.md` or `README.md` first to discover available components?
- Did it explore `node_modules/` to find component APIs instead of reading the injected docs?
- Did it guess import paths or selectors that caused build failures?

Score: **Compliant** (read docs first), **Partial** (read some docs), **Non-compliant** (skipped docs or explored node_modules)

### 3d. Build Health
Track all `run_command` tool calls where args contain `build` or `npm run build`:
- How many builds were attempted?
- How many succeeded vs failed?
- Were there consecutive failures (3+ in a row = build failure loop)?
- Was a `BUILD_FAILURE_NUDGE` triggered? If so, how many times?
- What were the common error patterns? (template errors, import errors, type errors)

### 3e. Efficiency Metrics
- **Turns to first code write**: how many turns before the first `write_files`/`write_file` call?
- **Turns to first build**: how many turns before the first `run_command` with build?
- **Exploration ratio**: (read_files + list_dir calls) / (write_files + edit_file calls) — high ratio means too much exploring vs producing
- **Total tool calls**: raw count
- **Wasted tool calls**: calls that returned errors or explored irrelevant paths

### 3f. Anti-Pattern Detection
Flag each detected anti-pattern with severity (High/Medium/Low):

| Anti-Pattern | Severity | How to Detect |
|-------------|----------|---------------|
| `node_modules` exploration when kit docs exist | High | `EXECUTING_TOOL` with `list_dir` or `read_files` targeting `node_modules/` AND (`KIT_CATALOG_INJECTED` or `KIT_DOC_FILES_INJECTED` present) |
| Writing code before reading component docs | High | First `write_files` with component code appears before any `read_files` of `.adorable/components/*.md` |
| High file churn (same file 3+ writes) | Medium | Count write operations per file path |
| Build failure loop (3+ consecutive failures) | High | 3+ sequential `run_command` builds with error results |
| Excessive turns (>10 for simple task, >20 for complex) | Medium | Check turn count vs task complexity |
| Exploration commands in non-source dirs | Low | `run_command` with grep/find/ls targeting `node_modules/`, `dist/`, `.angular/` |
| Guessing imports without reading docs | High | `write_files` with imports from `@fundamental-ngx/` or kit package, followed by build error about that import, without prior `read_files` of the component doc |
| Removing components to fix build errors | High | `edit_file` that removes a component import + its template usage after a build failure, instead of fixing the import |

## Step 4: Cross-Reference (Optional)

If the user asks for deeper analysis, also check:

- **Project files on disk**: Look in `storage/projects/{projectId}/` if the project ID is known (from the filename or INIT data). Compare final output files against what was written during the session.
- **Kit config**: Check `storage/kits/` for kit definitions to verify what components/docs were actually available.
- **Git history**: If the project dir has a `.git`, run `git log --oneline -10` inside it to see version history and `git diff HEAD~1` to see what the last session changed.

## Step 5: Output the Report

Format the report as follows:

---

## Session Analysis Report

### Overview
| Field | Value |
|-------|-------|
| Provider | ... |
| Model | ... |
| Duration | ... |
| Turns | ... |
| User Request | ... (first 100 chars) |
| Context Size | System: X chars, KB: Y chars, User: Z chars |

### Kit Status
- Kit: {name} | Catalog: {injected/empty} | Doc files: {count}
- Compliance: {Compliant/Partial/Non-compliant} — {reason}

### Tool Usage
| Tool | Calls | Errors | Notes |
|------|-------|--------|-------|
| read_files | ... | ... | ... |
| write_files | ... | ... | ... |
| edit_file | ... | ... | ... |
| run_command | ... | ... | ... |
| list_dir | ... | ... | ... |
| ... | ... | ... | ... |

### Build Results
- Attempts: X | Passed: Y | Failed: Z
- Build failure loop: Yes/No
- BUILD_FAILURE_NUDGE triggered: X times
- Common errors: ...

### Files Written
| File | Write Count | Notes |
|------|-------------|-------|
| ... | ... | churn? |

### Efficiency
| Metric | Value | Assessment |
|--------|-------|------------|
| Turns to first write | ... | ... |
| Turns to first build | ... | ... |
| Exploration ratio | ... | ... |
| Wasted tool calls | ... | ... |

### Detected Issues
| # | Severity | Anti-Pattern | Details |
|---|----------|-------------|---------|
| 1 | High | ... | ... |
| 2 | Medium | ... | ... |

### Recommendations
1. ...
2. ...
3. ...

---

Be specific in recommendations. Reference exact turn numbers and tool calls. Suggest concrete changes to system prompts, kit configurations, or tool definitions that would prevent the detected issues.
