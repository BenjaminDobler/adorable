import { MCPServerConfig } from '../mcp/types';
import { Kit } from './kits/types';
import { Question } from './question-manager';

export interface BuiltInToolConfig {
  webSearch?: boolean;
  urlContext?: boolean;
}

export interface GenerateOptions {
  prompt: string;
  previousFiles?: any;
  apiKey: string;
  model: string;
  images?: string[]; // Base64 data URIs
  openFiles?: { [path: string]: string };
  fileSystem?: FileSystemInterface; // Optional: Override default memory FS
  userId?: string;
  forcedSkill?: string;
  mcpConfigs?: MCPServerConfig[]; // MCP server configurations
  planMode?: boolean; // When true, AI should ask clarifying questions before coding
  baseUrl?: string; // Optional custom base URL for API proxy
  activeKit?: Kit; // Active component kit for this generation
  projectId?: string; // Project ID for debug log filenames
  builtInTools?: BuiltInToolConfig; // Built-in provider tools (web search, etc.)
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onToolStart?: (index: number, name: string) => void;
  onToolDelta?: (index: number, delta: string) => void;
  onToolCall?: (index: number, name: string, args: any) => void;
  onToolResult?: (tool_use_id: string, result: any, name?: string) => void;
  onTokenUsage?: (usage: TokenUsage) => void;
  // Progressive streaming callbacks
  onFileWritten?: (path: string, content: string) => void;
  onFileProgress?: (path: string, content: string, isComplete: boolean) => void;
  // Screenshot request callback - sends request to client via SSE
  onScreenshotRequest?: (requestId: string) => void;
  // Question request callback - sends question request to client via SSE
  onQuestionRequest?: (requestId: string, questions: Question[], context?: string) => void;
}

export interface LLMProvider {
  streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any>;
}

export interface FileSystemInterface {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  editFile(path: string, oldStr: string, newStr: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listDir(path: string): Promise<string[]>;
  glob(pattern: string): Promise<string[]>;
  grep(pattern: string, path?: string, caseSensitive?: boolean): Promise<string[]>;
  exec?(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  getAccumulatedFiles(): any; // Returns the file tree of changes
}

export interface Skill {
  name: string;
  description: string;
  instructions: string;
  triggers?: string[];
  // Path where it was found (for debugging/context)
  sourcePath?: string;

  // skills.sh compatible fields
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];  // space-delimited in SKILL.md, parsed to array

  // Enhanced skill support
  references?: SkillReference[];  // Loaded from references/ directory
}

export interface SkillReference {
  name: string;
  path: string;
  content: string;
}