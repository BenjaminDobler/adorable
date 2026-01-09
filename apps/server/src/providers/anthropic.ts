import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base';
import { ANGULAR_KNOWLEDGE_BASE } from './knowledge-base';
import { TOOLS } from './tools';

const SYSTEM_PROMPT = `
You are an expert Angular developer. 
Your task is to generate or modify the SOURCE CODE for an Angular application.

**CRITICAL: Use the provided tools to manage files.**
- Use 'write_file' to create or update files.
- Use 'read_file' to inspect existing code if you are unsure.
- Use 'list_dir' to explore the project structure.

Input Context:
- You will receive the "Current File Structure" (if any).
- If the user asks for a change, ONLY return the files that need to be modified or created.
- **DO NOT** return files that have not changed.

RULES:
1. **Root Component:** Ensure 'src/app/app.component.ts' exists and has selector 'app-root'.
2. **Features:** Use Angular 21+ Standalone components and signals.
3. **Styling:** Use inline styles in components or 'src/styles.css' for globals.
4. **Imports:** Ensure all imports are correct.
5. **Conciseness:** Minimize comments. Use compact CSS.
6. **Binary:** For small binary files (like icons), use the 'write_file' tool with base64 content. Prefer SVG for vector graphics.
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
      system: [
        {
          type: 'text',
          text: ANGULAR_KNOWLEDGE_BASE,
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: SYSTEM_PROMPT
        }
      ] as any,
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
      system: [
        {
          type: 'text',
          text: ANGULAR_KNOWLEDGE_BASE,
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: SYSTEM_PROMPT
        }
      ] as any,
      messages: messages as any,
      tools: TOOLS as any,
      stream: true,
    });

    let fullText = '';
    const toolInputs: {[key: number]: string} = {};
    const toolNames: {[key: number]: string} = {};

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolNames[event.index] = event.content_block.name;
          toolInputs[event.index] = '';
        }
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const delta = event.delta.text;
          fullText += delta;
          callbacks.onText?.(delta);
        } else if (event.delta.type === 'input_json_delta') {
          toolInputs[event.index] += event.delta.partial_json;
          callbacks.onToolDelta?.(event.index, event.delta.partial_json);
        }
      }

      if (event.type === 'content_block_stop') {
        if (toolNames[event.index]) {
          try {
            const args = JSON.parse(toolInputs[event.index]);
            callbacks.onToolCall?.(event.index, toolNames[event.index], args);
          } catch (e) {
            console.error('Failed to parse tool input', e);
          }
        }
      }
    }

    // After stream finishes, we need to return the "result" structure
    // Our existing base class parseResponse won't work perfectly if we used tools
    // We should build the result object from the accumulated tools and text.
    
    const files: any = {};
    for (const index in toolNames) {
      if (toolNames[index] === 'write_file') {
        try {
          const args = JSON.parse(toolInputs[index]);
          this.addFileToStructure(files, args.path, args.content);
        } catch (e) { }
      }
    }

    return { explanation: fullText, files };
  }
}
