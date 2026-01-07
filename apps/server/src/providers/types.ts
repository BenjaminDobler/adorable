export interface GenerateOptions {
  prompt: string;
  previousFiles?: any;
  apiKey: string;
  model: string;
  images?: string[]; // Base64 data URIs
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
}

export interface LLMProvider {
  generate(options: GenerateOptions): Promise<any>;
  streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any>;
}
