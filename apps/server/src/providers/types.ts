export interface GenerateOptions {
  prompt: string;
  previousFiles?: any;
  apiKey: string;
  model: string;
  images?: string[]; // Base64 data URIs
  smartRouting?: any; // The SmartRoutingConfig from the client
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