import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { LLMProvider } from './types';

export class ProviderFactory {
  static getProvider(providerName: string): LLMProvider {
    switch (providerName?.toLowerCase()) {
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
