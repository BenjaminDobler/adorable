export interface GenerateOptions {
  prompt: string;
  previousFiles?: any;
  apiKey: string;
  model: string;
  images?: string[]; // Base64 data URIs
}

export interface LLMProvider {
  generate(options: GenerateOptions): Promise<any>;
}
