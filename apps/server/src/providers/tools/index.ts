/**
 * Tool Registry
 *
 * Central registry for all tools. Each tool is a self-contained module that
 * exports a definition (schema) and an execute function. The registry replaces
 * the old tools.ts (schemas) + tool-executor.ts (switch statement) pattern.
 *
 * To add a new tool:
 * 1. Create a file in the appropriate subfolder (filesystem/, cdp/, figma/, etc.)
 * 2. Export a Tool object with definition + execute
 * 3. Import and register it here
 */

import { AgentLoopContext } from '../types';
import { Tool, ToolDefinition, ToolResult } from './types';

// --- Filesystem tools ---
import { readFile, readFiles, writeFile, writeFiles, editFile, patchFiles, deleteFile, renameFile, copyFile, listDir, glob, grep } from './filesystem';

// --- Build tools ---
import { verifyBuild, runCommand } from './build';

// --- Interaction tools ---
import { takeScreenshot, askUser, saveLesson, activateSkill, readSkillReference } from './interaction';

// --- CDP browser tools ---
import {
  browseScreenshot, browseEvaluate, browseAccessibility, browseConsole, browseNavigate, browseClick,
  inspectComponent, inspectPerformance, inspectRoutes, inspectSignals,
  inspectErrors,
  inspectStyles, inspectDom, measureElement, injectCss, getBundleStats,
  inspectNetwork,
  typeText,
  clearBuildCache, getContainerLogs,
} from './cdp';

// --- Figma tools ---
import {
  figmaGetSelection, figmaGetNode, figmaExportNode, figmaSelectNode,
  figmaSearchNodes, figmaGetFonts, figmaGetVariables,
  figmaCreateFromElement,
} from './figma';

// ─── Tool groups ───

/** Core tools — always available */
export const CORE_TOOLS: Tool[] = [
  readFile, readFiles, writeFile, writeFiles, editFile, patchFiles,
  deleteFile, renameFile, copyFile, listDir, glob, grep,
  takeScreenshot, askUser,
];

/** Skills tools — available when skills are registered */
export const SKILL_TOOLS: Tool[] = [activateSkill, readSkillReference];

/** Build tools — available when fs.exec is present */
export const BUILD_TOOLS: Tool[] = [verifyBuild, runCommand];

/** Kit lesson tool — available when a kit with lessons is active */
export const LESSON_TOOLS: Tool[] = [saveLesson];

/** CDP browser tools — available when CDP/preview is enabled */
export const CDP_TOOLS: Tool[] = [
  browseScreenshot, browseEvaluate, browseAccessibility, browseConsole, browseNavigate, browseClick,
  inspectComponent, inspectPerformance, inspectRoutes, inspectSignals,
  inspectErrors,
  inspectStyles, inspectDom, measureElement, injectCss, getBundleStats,
  inspectNetwork,
  typeText,
  clearBuildCache, getContainerLogs,
];

/** Figma tools — available when Figma Live Bridge is connected */
export const FIGMA_TOOLS: Tool[] = [
  figmaGetSelection, figmaGetNode, figmaExportNode, figmaSelectNode,
  figmaSearchNodes, figmaGetFonts, figmaGetVariables,
  figmaCreateFromElement,
];

// ─── Registry ───

const ALL_TOOLS: Tool[] = [
  ...CORE_TOOLS, ...SKILL_TOOLS, ...BUILD_TOOLS, ...LESSON_TOOLS,
  ...CDP_TOOLS, ...FIGMA_TOOLS,
];

const registry = new Map<string, Tool>();
for (const tool of ALL_TOOLS) {
  registry.set(tool.definition.name, tool);
}

/**
 * Execute a tool by name. Replaces the old switch statement in tool-executor.ts.
 */
export async function executeToolByName(
  toolName: string,
  toolArgs: any,
  ctx: AgentLoopContext,
): Promise<ToolResult> {
  const tool = registry.get(toolName);
  if (!tool) {
    return { content: `Error: Unknown tool ${toolName}`, isError: true };
  }
  try {
    return await tool.execute(toolArgs, ctx);
  } catch (err: any) {
    return { content: `Error: ${err.message}`, isError: true };
  }
}

/**
 * Set of tool names that are safe to execute in parallel (read-only, no side effects).
 * Replaces PARALLELIZABLE_TOOLS from system-prompts.ts.
 */
export const PARALLELIZABLE_TOOL_NAMES = new Set(
  ALL_TOOLS
    .filter(t => t.definition.isReadOnly)
    .map(t => t.definition.name)
);

/**
 * Strip internal-only fields from a tool definition before sending to the LLM API.
 * The API rejects extra fields like `isReadOnly` that are only used server-side.
 */
function toLLMSchema(def: ToolDefinition): { name: string; description: string; input_schema: Record<string, unknown> } {
  return {
    name: def.name,
    description: def.description,
    input_schema: def.input_schema,
  };
}

/**
 * Get tool definitions for the LLM based on available capabilities.
 * Strips internal-only fields (isReadOnly, etc.) that the API would reject.
 */
export function getToolDefinitions(options?: {
  cdp?: boolean;
  figma?: boolean;
  skills?: boolean;
  exec?: boolean;
  lessons?: boolean;
}): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  const tools = CORE_TOOLS.map(t => toLLMSchema(t.definition));
  if (options?.skills) tools.push(...SKILL_TOOLS.map(t => toLLMSchema(t.definition)));
  if (options?.exec) tools.push(...BUILD_TOOLS.map(t => toLLMSchema(t.definition)));
  if (options?.lessons) tools.push(...LESSON_TOOLS.map(t => toLLMSchema(t.definition)));
  if (options?.cdp) tools.push(...CDP_TOOLS.map(t => toLLMSchema(t.definition)));
  if (options?.figma) tools.push(...FIGMA_TOOLS.map(t => toLLMSchema(t.definition)));
  return tools;
}

// ─── MCP tool execution ───
// MCP tools are dynamic (registered at runtime by MCP servers), so they
// can't be in the static registry. This function handles them directly.

import { MCPToolResult } from '../../mcp/types';

export async function executeMCPTool(
  toolName: string,
  toolArgs: any,
  ctx: AgentLoopContext,
): Promise<ToolResult> {
  if (!ctx.mcpManager) {
    return { content: 'MCP Manager not initialized', isError: true };
  }

  try {
    const result: MCPToolResult = await ctx.mcpManager.callTool(toolName, toolArgs);

    const formattedContent = result.content
      .map((item: any) => {
        if (item.type === 'text' && item.text) return item.text;
        if (item.type === 'image' && item.data) return `[Image: ${item.mimeType || 'image/png'}]`;
        if (item.type === 'resource') return `[Resource: ${item.mimeType || 'unknown'}]`;
        return '';
      })
      .filter(Boolean)
      .join('\n');

    return {
      content: formattedContent || 'Tool executed successfully',
      isError: result.isError || false,
    };
  } catch (error) {
    return {
      content: `MCP tool error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isError: true,
    };
  }
}

// Re-export types
export { Tool, ToolDefinition, ToolResult } from './types';
export { validateToolArgs, sanitizeFileContent } from './utils';
