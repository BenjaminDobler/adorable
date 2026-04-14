import { MCPServerConfig } from '../mcp/types';
import { MCPManager } from '../mcp/mcp-manager';
import { Kit } from './kits/types';
import { Question } from './question-manager';
import { SkillRegistry } from './skills/skill-registry';
import { DebugLogger } from './debug-logger';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface BuiltInToolConfig {
  webSearch?: boolean;
  urlContext?: boolean;
}

export interface SapAiCoreConfig {
  authUrl: string;
  clientId: string;
  clientSecret: string; // decrypted
  resourceGroup: string;
  baseUrl: string;
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
  reasoningEffort?: 'low' | 'medium' | 'high'; // Controls model thinking depth
  history?: HistoryMessage[]; // Previous conversation turns (text only)
  contextSummary?: string; // Compacted summary of older conversation turns
  sapAiCore?: SapAiCoreConfig; // SAP AI Core connection config
  kitLessonsEnabled?: boolean; // Enable save_lesson tool + lesson injection (default: true)
  cdpEnabled?: boolean; // Enable CDP browser tools (desktop mode with preview active)
  figmaLiveConnected?: boolean; // Enable Figma live bridge tools (plugin WebSocket connected)
  figmaNodeAnnotations?: boolean; // Annotate HTML with data-figma-node attributes for design comparison
  skipVisualEditingIds?: boolean; // Skip data-elements-id instruction (external projects use ong annotations instead)
  selectedApp?: string; // Selected Nx app root (e.g. "apps/my-app") — workspace-scoped context for AI
  previewRoute?: string; // Current route path visible in the preview (e.g. "/dashboard")
  buildCommand?: string; // Override build command (e.g. "npx @richapps/ong build --project apps/my-app")
  researchAgentEnabled?: boolean; // Enable pre-generation research agent (default: true)
  reviewAgentEnabled?: boolean; // Enable post-generation code review agent (default: true)
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface PreflightDecision {
  runResearch: boolean;        // should the research agent analyze the codebase?
  topicShift: boolean;         // is this a new topic vs continuation of prior work?
  suggestClearContext: boolean; // recommend clearing conversation history?
  reasoningEffort: 'low' | 'medium' | 'high';
  skillHint?: string;          // pre-detected skill to activate (e.g. 'angular-expert')
  requiresPlan?: boolean;      // complex prompt — force a plan-first turn before coding
  reasoning?: string;          // brief explanation of the decision (for logging)
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
  // Preflight decision callback - notifies client of routing decisions (topic shift, context suggestions)
  onPreflightDecision?: (decision: PreflightDecision) => void;
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

export interface AgentLoopContext {
  fs: FileSystemInterface;
  callbacks: StreamCallbacks;
  skillRegistry: SkillRegistry;
  availableTools: any[];
  logger: DebugLogger;
  hasRunBuild: boolean;
  hasWrittenFiles: boolean;
  modifiedFiles: string[]; // tracks all files written/edited during generation
  writtenFilesSet: Set<string>; // tracks files written (for dedup warnings — detects rewrites)
  modifiedFilesAtTurnStart: number; // snapshot of modifiedFiles.length at turn start (for session tracker)
  buildNudgeSent: boolean;
  fullExplanation: string;
  mcpManager?: MCPManager;
  failedBuildCount: number;
  lastBuildOutput: string;
  activeKitName?: string;
  activeKitId?: string;
  userId?: string;
  projectId?: string;
  cdpEnabled?: boolean;
  hasVerifiedWithBrowser?: boolean;
  buildCommand: string; // The resolved build command (e.g. "npm run build" or "npx @richapps/ong build --project apps/my-app")
}