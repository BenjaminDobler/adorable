export interface FileSystemNode {
  file?: {
    contents: string;
    encoding?: 'base64';
  };
  directory?: {
    [name: string]: FileSystemNode;
  };
}

export interface FileTree {
  [name: string]: FileSystemNode;
}


export interface GenerateResponse {
  files: FileTree;
  explanation: string;
}

export interface GenerateRequest {
  prompt: string;
  previousFiles?: FileTree;
  openFiles?: { [path: string]: string };
}

// Figma Integration Types
export interface FigmaFile {
  key: string;
  name: string;
  thumbnail_url?: string;
  last_modified: string;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: 'FRAME' | 'COMPONENT' | 'COMPONENT_SET' | 'PAGE' | 'GROUP' | 'SECTION' | 'INSTANCE' | string;
  children?: FigmaNode[];
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface FigmaPage {
  id: string;
  name: string;
  children: FigmaNode[];
}

export interface FigmaSelection {
  nodeId: string;
  nodeName: string;
  nodeType: string;
}

export interface FigmaImportPayload {
  fileKey: string;
  fileName: string;
  selection: FigmaSelection[];
  jsonStructure: any;
  imageDataUris: string[];
}

// GitHub Integration Types
export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  name?: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description?: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubConnection {
  connected: boolean;
  username?: string;
  avatarUrl?: string;
}

export interface GitHubProjectSync {
  enabled: boolean;
  repoFullName?: string;
  branch?: string;
  lastSyncAt?: string;
  lastCommitSha?: string;
}

export interface GitHubSyncStatus {
  status: 'synced' | 'pending' | 'conflict' | 'error' | 'not_connected';
  message?: string;
  lastSyncAt?: string;
  pendingChanges?: number;
}

// Progressive Streaming Events
export interface FileWrittenEvent {
  type: 'file_written';
  path: string;
  content: string;
}

export interface FileProgressEvent {
  type: 'file_progress';
  path: string;
  content: string;
  isComplete: boolean;
}

// Kit / Starter Kit Types
export interface KitTemplate {
  type: 'default' | 'custom';
  files: FileTree;
  angularVersion?: string;
}

export interface DesignToken {
  name: string;
  value: string;
  cssVariable?: string;
}

export interface TypographyToken {
  name: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
}

export interface DesignTokens {
  colors?: DesignToken[];
  typography?: TypographyToken[];
  spacing?: DesignToken[];
  shadows?: DesignToken[];
  borderRadius?: DesignToken[];
}

/**
 * Deep-merge two FileTree trees. `generated` values override `base`.
 * When both sides have a directory at the same key, their contents are merged recursively.
 */
export function mergeFiles(base: FileTree, generated: FileTree): FileTree {
  const result: FileTree = { ...base };
  for (const key in generated) {
    if (generated[key].directory && result[key]?.directory) {
      result[key] = {
        directory: mergeFiles(result[key].directory!, generated[key].directory!),
      };
    } else {
      result[key] = generated[key];
    }
  }
  return result;
}

// Cloud Sync Types
export interface SyncStatusProject {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
  headSha: string | null;
}

export interface ProjectImportResponse {
  project: any;
  files: any;
  messages: any[];
  headSha: string | null;
}

export interface ProjectPushBody {
  files: any;
  messages: any[];
  name: string;
  thumbnail?: string;
  selectedKitId?: string;
}

export interface StorybookComponent {
  id: string;
  title: string;
  name: string;
  importPath?: string;
  type: 'docs' | 'story';
  componentName?: string;
  category?: string;
}

export interface KitResource {
  id: string;
  type: 'storybook' | 'design-tokens' | 'api-docs' | 'custom-rules' | 'figma';
  url: string;
  status: 'pending' | 'discovered' | 'error';
  lastDiscovered?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface StorybookResource extends KitResource {
  type: 'storybook';
  components: StorybookComponent[];
  selectedComponentIds: string[];
}

export interface Kit {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  template: KitTemplate;
  npmPackage?: string;
  resources: KitResource[];
  designTokens?: DesignTokens;
  mcpServerIds: string[];
  isBuiltIn?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Session Analyzer Types
export type SuggestionType =
  | 'kit_doc_improvement'
  | 'system_prompt_improvement'
  | 'kit_config'
  | 'workflow_recommendation'
  | 'project_structure';

export type SuggestionSeverity = 'high' | 'medium' | 'low';

export interface SessionSuggestionPatch {
  filePath: string;
  newContent: string;
  kitId?: string;
}

export interface SessionSuggestion {
  id: string;
  type: SuggestionType;
  severity: SuggestionSeverity;
  title: string;
  description: string;
  patch?: SessionSuggestionPatch;
  applied?: boolean;
}

export interface SessionOverview {
  provider: string;
  model: string;
  turns: number;
  timestamp: string;
  promptSummary: string;
  kitName?: string;
  buildAttempts: number;
  buildSuccesses: number;
  buildFailures: number;
  toolCallCount: number;
  errorCount: number;
}

export interface SessionLogEntry {
  filename: string;
  projectId?: string;
  provider: string;
  timestamp: string;
  overview: SessionOverview;
}

export interface AnalysisStreamEvent {
  type: 'progress' | 'overview' | 'suggestion' | 'complete' | 'error';
  message?: string;
  overview?: SessionOverview;
  suggestion?: SessionSuggestion;
  error?: string;
}

/** Canonical list of binary file extensions (lowercase, with leading dot). */
export const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.pdf', '.eot', '.ttf', '.woff', '.woff2',
  '.mp3', '.mp4', '.wav', '.ogg',
  '.zip', '.tar', '.gz', '.bz2',
]);
