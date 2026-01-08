import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base';

const SYSTEM_PROMPT = `
You are an expert Angular developer. 
Your task is to generate or modify the SOURCE CODE for an Angular application.

**CRITICAL: You are working within an EXISTING project structure.**
DO NOT generate package.json, angular.json, or tsconfig.json.
DO NOT generate src/main.ts or src/index.html unless you need to change them.

Input Context:
- You will receive the "Current File Structure" (if any).
- If the user asks for a change, ONLY return the files that need to be modified or created.
- **DO NOT** return files that have not changed. This is critical to avoid response truncation.

Output Format:
You must provide the output in the following XML-like format.
Do NOT use Markdown code blocks for the XML tags.

<explanation>
Brief explanation of what you did.
</explanation>

<file path="src/app/app.component.ts">
import { Component } from '@angular/core';
...
</file>

<file path="src/app/app.component.html">
<h1>Hello</h1>
</file>

<file path="src/assets/logo.png" encoding="base64">
...base64 content...
</file>

RULES:
1. **Root Component:** Ensure 'src/app/app.component.ts' exists and has selector 'app-root'.
2. **Features:** Use Angular 21+ Standalone components and signals.
3. **Styling:** Use inline styles in components or 'src/styles.css' for globals.
4. **Imports:** Ensure all imports are correct.
5. **Conciseness:** Minimize comments. Use compact CSS.
6. **Path:** The 'path' attribute must be relative to the project root (e.g., "src/app/foo.ts").
7. **Binary:** For small binary files (like icons), use 'encoding="base64"'. Prefer SVG for vector graphics.
`;

export class AnthropicProvider extends BaseLLMProvider implements LLMProvider {
  async generate(options: GenerateOptions): Promise<any> {
    const { prompt, previousFiles, apiKey, model } = options;

    if (!apiKey) throw new Error('Anthropic API Key is required');

    // Fallback for problematic model ID
    let modelToUse = model || 'claude-3-5-sonnet-20240620';
    if (modelToUse === 'claude-3-5-sonnet-20241022') {
      modelToUse = 'claude-3-5-sonnet-20240620';
    }

    const anthropic = new Anthropic({ apiKey });

    let userMessage = prompt;
    if (previousFiles) {
      userMessage += `\n\n--- Current File Structure ---\n${JSON.stringify(previousFiles, null, 2)}`;
    }

    const messages: any[] = [{ role: 'user', content: [] }];
    
    // Add text content
    messages[0].content.push({ type: 'text', text: userMessage });

    // Add images if present
    if (options.images && options.images.length > 0) {
      options.images.forEach(img => {
        // Expecting "data:image/png;base64,..."
        const match = img.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
        if (match) {
          messages[0].content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: `image/${match[1]}` as any,
              data: match[2]
            }
          });
        }
      });
    }

    const response = await anthropic.messages.create({
      model: modelToUse,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: messages as any,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return this.parseResponse(content.text);
    } else {
      throw new Error('Unexpected response format from Anthropic');
    }
  }

  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    const { prompt, previousFiles, apiKey, model } = options;
    if (!apiKey) throw new Error('Anthropic API Key is required');

    // Fallback for problematic model ID if user has it saved in settings
    let modelToUse = model || 'claude-3-5-sonnet-20240620';
    if (modelToUse === 'claude-3-5-sonnet-20241022') {
      modelToUse = 'claude-3-5-sonnet-20240620';
    }

    const anthropic = new Anthropic({ apiKey });
    let userMessage = prompt;
    if (previousFiles) {
      userMessage += `\n\n--- Current File Structure ---\n${JSON.stringify(previousFiles, null, 2)}`;
    }

    const messages: any[] = [{ role: 'user', content: [{ type: 'text', text: userMessage }] }];
    
    // Add images if present
    if (options.images && options.images.length > 0) {
      options.images.forEach(img => {
        const match = img.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
        if (match) {
          messages[0].content.push({
            type: 'image',
            source: { type: 'base64', media_type: `image/${match[1]}` as any, data: match[2] }
          });
        }
      });
    }

    const stream = await anthropic.messages.create({
      model: modelToUse,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: messages as any,
      stream: true,
    });

    let fullText = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && (event.delta as any).text) {
        const delta = (event.delta as any).text;
        fullText += delta;
        callbacks.onText?.(delta);
      }
    }

    return this.parseResponse(fullText);
  }
}
