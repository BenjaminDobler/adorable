import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { ClaudeCodeProvider } from './claude-code';
import { LLMProvider } from './types';

export class ProviderFactory {
  static getProvider(providerName: string): LLMProvider {
    switch (providerName?.toLowerCase()) {
      case 'claude-code':
        return new ClaudeCodeProvider();
      case 'google':
      case 'gemini':
        return new GeminiProvider();
      case 'anthropic':
      case 'claude':
      default:
        return new AnthropicProvider();
    }
  }
}
