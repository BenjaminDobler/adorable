export interface GenerateOptions {
  prompt: string;
  previousFiles?: any;
  apiKey: string;
  model: string;
  images?: string[]; // Base64 data URIs
  smartRouting?: any; // The SmartRoutingConfig from the client
  openFiles?: { [path: string]: string };
  fileSystem?: FileSystemInterface; // Optional: Override default memory FS
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
  onToolResult?: (tool_use_id: string, result: any) => void;
  onTokenUsage?: (usage: TokenUsage) => void;
}

export interface LLMProvider {
  generate(options: GenerateOptions): Promise<any>;
  streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any>;
}

export interface FileSystemInterface {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  editFile(path: string, oldStr: string, newStr: string): Promise<void>;
  listDir(path: string): Promise<string[]>;
  glob(pattern: string): Promise<string[]>;
  exec?(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  getAccumulatedFiles(): any; // Returns the file tree of changes
}