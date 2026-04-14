# Tool Architecture Refactor

**Status:** Plan — ready for implementation
**Motivation:** Tools are currently split across 3 disconnected files: schemas in `tools.ts`, execution in a ~600-line switch statement in `tool-executor.ts`, and implementations in `filesystem/disk-filesystem.ts` and various services. Adding a new tool requires touching all three. Schema and implementation can drift out of sync.

## Current structure

```
providers/
├── tools.ts              # Schema definitions (TOOLS, CDP_TOOLS, FIGMA_TOOLS)
├── tool-executor.ts      # ~600-line switch(toolName) dispatch
├── system-prompts.ts     # References tool names in prompt text
└── filesystem/
    └── disk-filesystem.ts  # Actual fs operations (readFile, writeFile, editFile, etc.)
```

**Problems:**
1. Schema is disconnected from implementation — change args in one, forget the other
2. The switch statement is hard to navigate and grows with every tool
3. Adding a tool touches 3 files minimum
4. No natural grouping — CDP tools, Figma tools, filesystem tools are all in the same switch
5. Hard to test individual tools in isolation

## Proposed structure

```
providers/tools/
├── index.ts                          # Registry, buildToolList(), executeTool()
├── types.ts                          # ToolDefinition, ToolResult, shared interfaces
│
├── filesystem/
│   ├── read-file.ts
│   ├── read-files.ts
│   ├── write-file.ts
│   ├── write-files.ts
│   ├── edit-file.ts
│   ├── patch-files.ts
│   ├── delete-file.ts
│   ├── rename-file.ts
│   ├── copy-file.ts
│   ├── list-dir.ts
│   ├── glob.ts
│   └── grep.ts
│
├── build/
│   ├── verify-build.ts
│   └── run-command.ts
│
├── cdp/
│   ├── browse-screenshot.ts
│   ├── browse-evaluate.ts
│   ├── browse-click.ts
│   ├── browse-navigate.ts
│   ├── browse-console.ts
│   ├── browse-accessibility.ts
│   ├── inspect-component.ts
│   ├── inspect-styles.ts
│   ├── inspect-dom.ts
│   ├── inspect-routes.ts
│   ├── inspect-signals.ts
│   ├── inspect-errors.ts
│   ├── inspect-network.ts
│   ├── inspect-performance.ts
│   ├── measure-element.ts
│   ├── type-text.ts
│   ├── inject-css.ts
│   ├── clear-build-cache.ts
│   ├── get-container-logs.ts
│   └── get-bundle-stats.ts
│
├── figma/
│   ├── get-selection.ts
│   ├── get-node.ts
│   ├── export-node.ts
│   ├── select-node.ts
│   ├── search-nodes.ts
│   ├── get-fonts.ts
│   └── get-variables.ts
│
├── interaction/
│   ├── ask-user.ts
│   ├── take-screenshot.ts
│   └── save-lesson.ts
│
└── kit/
    └── query-kit.ts
```

## Tool file pattern

Each tool file exports a definition and an execute function:

```typescript
// tools/filesystem/read-file.ts
import { ToolDefinition, ToolResult, AgentLoopContext } from '../types';

export const definition: ToolDefinition = {
  name: 'read_file',
  group: 'core',                    // core | cdp | figma | kit
  description: 'Reads the content of a single file. Prefer read_files when you need to read multiple files.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to read.'
      }
    },
    required: ['path']
  },
  isReadOnly: true,                 // Used by PARALLELIZABLE_TOOLS
};

export async function execute(
  args: { path: string },
  ctx: AgentLoopContext,
): Promise<ToolResult> {
  const content = await ctx.fs.readFile(args.path);
  return { content, isError: false };
}
```

## Registry (index.ts)

Replaces both `tools.ts` (schema exports) and the switch statement in `tool-executor.ts`:

```typescript
// tools/index.ts
import { AgentLoopContext } from '../types';

// Import all tools
import * as readFile from './filesystem/read-file';
import * as readFiles from './filesystem/read-files';
import * as writeFile from './filesystem/write-file';
// ... etc

export interface RegisteredTool {
  definition: ToolDefinition;
  execute: (args: any, ctx: AgentLoopContext) => Promise<ToolResult>;
}

// All tools registered in a map — replaces the switch statement
const ALL_TOOLS: RegisteredTool[] = [
  readFile, readFiles, writeFile, writeFiles, editFile, patchFiles,
  deleteFile, renameFile, copyFile, listDir, glob, grep,
  askUser, takeScreenshot, saveLesson,
];

const CDP_TOOLS: RegisteredTool[] = [
  browseScreenshot, browseEvaluate, browseClick, browseNavigate,
  browseConsole, browseAccessibility,
  inspectComponent, inspectStyles, inspectDom, inspectRoutes,
  inspectSignals, inspectErrors, inspectNetwork, inspectPerformance,
  measureElement, typeText, injectCss, clearBuildCache,
  getContainerLogs, getBundleStats,
];

const FIGMA_TOOLS: RegisteredTool[] = [
  figmaGetSelection, figmaGetNode, figmaExportNode,
  figmaSelectNode, figmaSearchNodes, figmaGetFonts, figmaGetVariables,
];

const registry = new Map<string, RegisteredTool>();
for (const tool of [...ALL_TOOLS, ...CDP_TOOLS, ...FIGMA_TOOLS]) {
  registry.set(tool.definition.name, tool);
}

// Replaces the switch statement in tool-executor.ts
export async function executeTool(
  name: string,
  args: any,
  ctx: AgentLoopContext,
): Promise<ToolResult> {
  const tool = registry.get(name);
  if (!tool) {
    return { content: `Unknown tool: ${name}`, isError: true };
  }
  return tool.execute(args, ctx);
}

// Replaces the TOOLS/CDP_TOOLS/FIGMA_TOOLS exports in tools.ts
export function getToolDefinitions(options: {
  cdp?: boolean;
  figma?: boolean;
  kit?: boolean;
}): ToolDefinition[] {
  const tools = ALL_TOOLS.map(t => t.definition);
  if (options.cdp) tools.push(...CDP_TOOLS.map(t => t.definition));
  if (options.figma) tools.push(...FIGMA_TOOLS.map(t => t.definition));
  return tools;
}

// Replaces PARALLELIZABLE_TOOLS set in system-prompts.ts
export const PARALLELIZABLE_TOOLS = new Set(
  [...ALL_TOOLS, ...CDP_TOOLS, ...FIGMA_TOOLS]
    .filter(t => t.definition.isReadOnly)
    .map(t => t.definition.name)
);
```

## Types

```typescript
// tools/types.ts

export interface ToolDefinition {
  name: string;
  group: 'core' | 'cdp' | 'figma' | 'kit';
  description: string;
  input_schema: Record<string, unknown>;
  isReadOnly?: boolean;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}
```

## Migration strategy

The refactor is mechanical — no logic changes, just moving code:

1. **Create `providers/tools/types.ts`** with ToolDefinition, ToolResult
2. **Create `providers/tools/index.ts`** with registry, executeTool(), getToolDefinitions()
3. **For each tool in the switch statement:**
   - Create the tool file in the appropriate subfolder
   - Move the schema from `tools.ts` → `definition` export
   - Move the switch case body from `tool-executor.ts` → `execute` export
   - Import in `index.ts`
4. **Update imports** in `anthropic.ts`, `gemini.ts`, `context-builder.ts`, `base.ts`
5. **Delete** the old `tools.ts` and `tool-executor.ts` (or keep as thin re-exports during migration)

**Order:** Start with the filesystem tools (most straightforward), then CDP, then Figma. Test after each group.

## Shared utilities

Some logic in `tool-executor.ts` is shared across tools:
- `sanitizeFileContent()` — used by write_file, write_files
- `validateToolArgs()` — used by most tools
- JSON repair for malformed LLM output

These move to `tools/shared/` or `tools/utils.ts`.

## Benefits

- **One file = one tool** — schema, execution, and constants together
- **Adding a tool = create one file + register in index.ts**
- **No 600-line switch statement** — dispatch is a map lookup
- **Natural grouping** — filesystem/, cdp/, figma/ folders
- **Testable** — each tool can be unit tested independently
- **Discoverable** — `ls tools/cdp/` shows all browser tools

## Files to change

- Create `providers/tools/` directory with ~45 files
- Delete or thin out `providers/tools.ts` (old schema file)
- Delete or thin out `providers/tool-executor.ts` (old switch statement)
- Update `providers/anthropic.ts` — import from `tools/index`
- Update `providers/gemini.ts` — import from `tools/index`
- Update `providers/context-builder.ts` — import from `tools/index`
- Update `providers/base.ts` — import executeTool from `tools/index`
- Update `providers/system-prompts.ts` — import PARALLELIZABLE_TOOLS from `tools/index`
