import { AgentLoopContext } from '../types';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** If true, this tool is safe to run in parallel with other read-only tools */
  isReadOnly?: boolean;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

export interface Tool {
  definition: ToolDefinition;
  execute: (args: any, ctx: AgentLoopContext) => Promise<ToolResult>;
}
