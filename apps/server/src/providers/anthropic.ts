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

    let modelToUse = model || 'claude-3-5-sonnet-20240620';
    if (modelToUse === 'claude-3-5-sonnet-20241022') {
      modelToUse = 'claude-3-5-sonnet-20240620';
    }

    const anthropic = new Anthropic({ apiKey });
    
    // Prepare initial context
    // We provide a file tree summary if files exist, to encourage read_file usage
    // But for now, we still provide full context to keep it simple, 
    // effectively making read_file a "verification" tool if the AI wants to double check.
    let userMessage = prompt;
    if (previousFiles) {
      // TODO: Optimize this to only send tree structure in the future
      userMessage += `\n\n--- Current File Structure ---\n${JSON.stringify(previousFiles, null, 2)}`;
    }

    const messages: any[] = [{ role: 'user', content: [{ type: 'text', text: userMessage }] }];
    
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

    const fileMap = this.flattenFiles(previousFiles || {});
    const accumulatedFiles: any = {};
    let fullExplanation = '';
    let turnCount = 0;
    const MAX_TURNS = 10;

    while (turnCount < MAX_TURNS) {
      const stream = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 8192,
        system: [
          { type: 'text', text: ANGULAR_KNOWLEDGE_BASE, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: SYSTEM_PROMPT }
        ] as any,
        messages: messages as any,
        tools: TOOLS as any,
        stream: true,
      });

      let toolUses: { id: string, name: string, input: string }[] = [];
      let currentToolUse: { id: string, name: string, input: string } | null = null;
      let assistantMessageContent: any[] = [];

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = { id: event.content_block.id, name: event.content_block.name, input: '' };
            toolUses.push(currentToolUse);
            assistantMessageContent.push(event.content_block);
          } else if (event.content_block.type === 'text') {
            assistantMessageContent.push({ type: 'text', text: '' });
          }
        }

        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const text = event.delta.text;
            fullExplanation += text;
            callbacks.onText?.(text);
            const lastBlock = assistantMessageContent[assistantMessageContent.length - 1];
            if (lastBlock?.type === 'text') lastBlock.text += text;
          } else if (event.delta.type === 'input_json_delta') {
            if (currentToolUse) {
               currentToolUse.input += event.delta.partial_json;
               // We use index relative to the message content block index
               callbacks.onToolDelta?.(assistantMessageContent.length - 1, event.delta.partial_json);
            }
          }
        }
      }

      // Update assistantMessageContent with full inputs
      for (const block of assistantMessageContent) {
        if (block.type === 'tool_use') {
           // Find the accumulated input for this tool ID
           // We stored it in toolUses array
           const tool = toolUses.find(t => t.id === block.id);
           if (tool) {
              try {
                // Input must be an object, not string
                block.input = JSON.parse(tool.input);
              } catch (e) {
                // If input is incomplete JSON, we can't really reconstruct it validly.
                // We'll set it to empty object to satisfy the type, but this turn is doomed.
                block.input = {}; 
              }
           }
        }
      }

      messages.push({ role: 'assistant', content: assistantMessageContent });

      if (toolUses.length === 0) {
        break; 
      }

      // Execute all tools
      const toolResults: any[] = [];
      for (const tool of toolUses) {
        let toolArgs: any = {};
        let parseError = false;
        try {
          toolArgs = JSON.parse(tool.input);
          callbacks.onToolCall?.(0, tool.name, toolArgs);
        } catch (e) {
          console.error('Failed to parse tool input', e);
          parseError = true;
        }

        let content = '';
        let isError = false;

        if (parseError) {
           content = 'Error: Invalid JSON input for tool.';
           isError = true;
        } else if (tool.name === 'write_file') {
          this.addFileToStructure(accumulatedFiles, toolArgs.path, toolArgs.content);
          content = 'File created successfully.';
        } else if (tool.name === 'read_file') {
          content = fileMap[toolArgs.path] || 'Error: File not found.';
          if (content.startsWith('Error:')) isError = true;
        } else if (tool.name === 'list_dir') {
          const dir = toolArgs.path;
          const matching = Object.keys(fileMap).filter(k => k.startsWith(dir));
          content = matching.length ? matching.join('\n') : 'Directory is empty or not found.';
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content,
          is_error: isError
        });
      }

      messages.push({ role: 'user', content: toolResults });
      turnCount++;
    }

    return { explanation: fullExplanation, files: accumulatedFiles };
  }

  private flattenFiles(structure: any, prefix = ''): Record<string, string> {
    let map: Record<string, string> = {};
    for (const key in structure) {
      const node = structure[key];
      const path = prefix + key;
      if (node.file) {
        map[path] = node.file.contents;
      } else if (node.directory) {
        Object.assign(map, this.flattenFiles(node.directory, path + '/'));
      }
    }
    return map;
  }
}
