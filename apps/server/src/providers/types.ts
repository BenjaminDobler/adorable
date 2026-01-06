export interface GenerateOptions {
  prompt: string;
  previousFiles?: any;
  apiKey: string;
  model: string;
}

export interface LLMProvider {
  generate(options: GenerateOptions): Promise<any>;
}
