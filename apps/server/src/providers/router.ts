import { ProviderFactory } from './factory';
import { DebugLogger } from './debug-logger';

export class SmartRouter {
  private logger = new DebugLogger('router');

  async route(prompt: string, config: any, getApiKey: (provider: string) => string | undefined): Promise<{ provider: string, model: string, apiKey: string }> {
    if (!config || !config.enabled) {
      // Default to complex if no config or disabled
      const provider = config?.complex?.provider || 'anthropic';
      const model = config?.complex?.model || 'claude-3-5-sonnet-20240620';
      const apiKey = getApiKey(provider);
      return { provider, model, apiKey: apiKey || '' };
    }

    // Special case: Vision
    const hasImages = prompt.includes('[Attached File Content (image/') || prompt.includes('data:image/'); // Simplistic check
    if (hasImages) {
      const { provider, model } = config.vision;
      this.logger.log('ROUTING_DECISION', { reason: 'VISION_DETECTED', provider, model });
      return { provider, model, apiKey: getApiKey(provider) || '' };
    }

    const routerConfig = config.router;
    // Map internal names to verified IDs
    let routerModel = routerConfig.model;
    if (routerModel === 'gemini-1.5-flash') routerModel = 'gemini-1.5-flash-002';
    if (routerModel === 'gemini-1.5-pro') routerModel = 'gemini-1.5-pro-002';

    const routerApiKey = getApiKey(routerConfig.provider);

    if (!routerApiKey) {
       // Fallback if router key is missing
       const { provider, model } = config.complex;
       this.logger.log('ROUTING_FALLBACK', { reason: 'ROUTER_KEY_MISSING', provider, model });
       return { provider, model, apiKey: getApiKey(provider) || '' };
    }

    try {
      const routerProvider = ProviderFactory.getProvider(routerConfig.provider);
      const classificationPrompt = `Classify the following user request into either 'SIMPLE' or 'COMPLEX'.
      
      - SIMPLE: Typos, small CSS changes, text updates, code explanations, or single-line fixes.
      - COMPLEX: Logic changes, new features, refactoring, architectural changes, or complex debugging.
      
      Output ONLY the word 'SIMPLE' or 'COMPLEX'.
      
      Request: "${prompt.substring(0, 1000)}"`;

      this.logger.log('CLASSIFYING_START', { routerModel });
      
      const response = await routerProvider.generate({
        prompt: classificationPrompt,
        apiKey: routerApiKey,
        model: routerModel
      });

      const classification = response.explanation.trim().toUpperCase();
      this.logger.log('CLASSIFIED', { classification });

      if (classification.includes('SIMPLE')) {
        const { provider, model } = config.simple;
        return { provider, model, apiKey: getApiKey(provider) || '' };
      } else {
        const { provider, model } = config.complex;
        return { provider, model, apiKey: getApiKey(provider) || '' };
      }
    } catch (error) {
      this.logger.log('ROUTING_ERROR', { error: error.message });
      const { provider, model } = config.complex;
      return { provider, model, apiKey: getApiKey(provider) || '' };
    }
  }
}
