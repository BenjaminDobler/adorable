import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { minimatch } from 'minimatch';
import { jsonrepair } from 'jsonrepair';
import { BaseLLMProvider } from './base';
import { ANGULAR_KNOWLEDGE_BASE } from './knowledge-base';
import { TOOLS } from './tools';

const SYSTEM_PROMPT =
"You are an expert Angular developer.\n"
+"Your task is to generate or modify the SOURCE CODE for an Angular application.\n\n"
+"**CRITICAL: Tool Use & Context**\n"
+"- You have access to the **FILE STRUCTURE ONLY** initially.\n"
+"- You **MUST** use the `read_file` tool to inspect the code of any file you plan to modify or need to understand.\n"
+"- **NEVER** guess the content of a file. Always read it first to ensure you have the latest version.\n"
+"- Use `write_file` to create or update files.\n"
+"- Use `edit_file` for precise modifications when you want to change a specific part of a file without rewriting the whole content. `old_str` must match exactly.\n\n"
+"**RESTRICTED FILES (DO NOT EDIT):**\n"
+"- `package.json`, `angular.json`, `tsconfig.json`, `tsconfig.app.json`: Do NOT modify these files unless you are explicitly adding a dependency or changing a build configuration.\n"
+"- **NEVER** overwrite `package.json` with a generic template. The project is already set up with Angular 21.\n\n"
+"Input Context:\n"
+"- You will receive the \"Current File Structure\".\n"
+"- If the user asks for a change, ONLY return the files that need to be modified or created.\n\n"
+"RULES:\n"
+"1. **Root Component:** Ensure 'src/app/app.component.ts' exists and has selector 'app-root'.\n"
+"2. **Features:** Use Angular 21+ Standalone components and signals.\n"
+"3. **Styling:** Use inline styles in components or 'src/styles.css' for globals.\n"
+"4. **Imports:** Ensure all imports are correct.\n"
+"5. **Conciseness:** Minimize comments. Use compact CSS.\n"
+"6. **Binary:** For small binary files (like icons), use the 'write_file' tool with base64 content. Prefer SVG for vector graphics.\n";

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
      const treeSummary = this.generateTreeSummary(previousFiles);
      userMessage += `\n\n--- Current File Structure ---\n${treeSummary}`;
    }

    const messages: any[] = [{ role: 'user', content: [] }];
    
    // Add text content
    messages[0].content.push({ type: 'text', text: userMessage });

    // Add images if present
    if (options.images && options.images.length > 0) {
      options.images.forEach(img => {
        // Expecting "data:image/png;base64,வைக்"
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

    const anthropic = new Anthropic({ 
      apiKey,
      defaultHeaders: { 'anthropic-beta': 'pdfs-2024-09-25' }
    });
    
    // Prepare initial context
    // We ONLY provide the file tree summary to encourage read_file usage
    let userMessage = prompt;
    if (previousFiles) {
      const treeSummary = this.generateTreeSummary(previousFiles);
      userMessage += `\n\n--- Current File Structure ---\n${treeSummary}`;
    }

    const messages: any[] = [{ role: 'user', content: [{ type: 'text', text: userMessage }] }];
    
    if (options.images && options.images.length > 0) {
      options.images.forEach(dataUri => {
        const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const data = match[2];

          if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
             messages[0].content.push({
               type: 'image',
               source: { type: 'base64', media_type: mimeType as any, data: data }
             });
          } else if (mimeType === 'application/pdf') {
             messages[0].content.push({
               type: 'document',
               source: { type: 'base64', media_type: 'application/pdf', data: data }
             });
          } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
             try {
                const textContent = Buffer.from(data, 'base64').toString('utf-8');
                messages[0].content.push({
                   type: 'text',
                   text: `\n[Attached File Content (${mimeType})]:\n${textContent}\n`
                });
             } catch(e) { console.error('Failed to decode text attachment', e); }
          }
        }
      });
    }

    // Keep the map for read_file execution
    const fileMap = this.flattenFiles(previousFiles || {});
    const accumulatedFiles: any = {};
    let fullExplanation = '';
    let turnCount = 0;
    const MAX_TURNS = 10;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

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

      const toolUses: { id: string, name: string, input: string }[] = [];
      let currentToolUse: { id: string, name: string, input: string } | null = null;
      const assistantMessageContent: any[] = [];

      for await (const event of stream) {
        if (event.type === 'message_start' && event.message.usage) {
           totalInputTokens += event.message.usage.input_tokens;
           callbacks.onTokenUsage?.({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens });
        }
        if (event.type === 'message_delta' && event.usage) {
           totalOutputTokens += event.usage.output_tokens;
           callbacks.onTokenUsage?.({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens });
        }

        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = { id: event.content_block.id, name: event.content_block.name, input: '' };
            toolUses.push(currentToolUse);
            assistantMessageContent.push(event.content_block);
            callbacks.onToolStart?.(assistantMessageContent.length - 1, event.content_block.name);
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
                 try {
                    block.input = JSON.parse(jsonrepair(tool.input));
                 } catch (repairError) {
                    // If input is incomplete JSON, we can't really reconstruct it validly.
                    // We'll set it to empty object to satisfy the type, but this turn is doomed.
                    block.input = {}; 
                 }
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
          try {
             toolArgs = JSON.parse(jsonrepair(tool.input));
             callbacks.onToolCall?.(0, tool.name, toolArgs);
          } catch (repairError) {
             console.error('Failed to parse tool input', e);
             parseError = true;
          }
        }

        let content = '';
        let isError = false;

        if (parseError) {
           content = 'Error: Invalid JSON input for tool.';
           isError = true;
        } else if (tool.name === 'write_file') {
          this.addFileToStructure(accumulatedFiles, toolArgs.path, toolArgs.content);
          content = 'File created successfully.';
        } else if (tool.name === 'edit_file') {
          const originalContent = fileMap[toolArgs.path];
          if (!originalContent) {
            content = 'Error: File not found. You must ensure the file exists before editing it.';
            isError = true;
          } else {
            if (originalContent.includes(toolArgs.old_str)) {
              const parts = originalContent.split(toolArgs.old_str);
              if (parts.length > 2) {
                 content = 'Error: old_str is not unique in the file. Please provide more context in old_str to make it unique.';
                 isError = true;
              } else {
                 const newContent = originalContent.replace(toolArgs.old_str, toolArgs.new_str);
                 fileMap[toolArgs.path] = newContent; 
                 this.addFileToStructure(accumulatedFiles, toolArgs.path, newContent);
                 content = 'File edited successfully.';
              }
            } else {
              content = 'Error: old_str not found in file. Please ensure it matches exactly, including whitespace.';
              isError = true;
            }
          }
        } else if (tool.name === 'read_file') {
          content = fileMap[toolArgs.path] || 'Error: File not found. The file may not exist in the current project structure.';
          if (content.startsWith('Error:')) isError = true;
        } else if (tool.name === 'list_dir') {
          let dir = toolArgs.path;
          if (dir === '.' || dir === './') dir = '';
          if (dir && !dir.endsWith('/')) dir += '/';
          
          const matching = Object.keys(fileMap)
            .filter(k => k.startsWith(dir))
            .map(k => {
              const relative = k.substring(dir.length);
              const parts = relative.split('/');
              const isDir = parts.length > 1;
              return isDir ? parts[0] + '/' : parts[0];
            });
          
          const unique = Array.from(new Set(matching)).sort();
          content = unique.length ? unique.join('\n') : 'Directory is empty or not found.';
        } else if (tool.name === 'glob') {
          const pattern = toolArgs.pattern;
          const matchingFiles = Object.keys(fileMap).filter(path => minimatch(path, pattern));
          content = matchingFiles.length ? matchingFiles.join('\n') : 'No files matched the pattern.';
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content,
          is_error: isError
        });
        
        callbacks.onToolResult?.(tool.id, content);
      }

      messages.push({ role: 'user', content: toolResults });
      turnCount++;
    }

    return { explanation: fullExplanation, files: accumulatedFiles };
  }

  private flattenFiles(structure: any, prefix = ''): Record<string, string> {
    const map: Record<string, string> = {};
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

  private generateTreeSummary(structure: any, prefix = ''): string {
    let summary = '';
    const entries = Object.entries(structure).sort((a, b) => a[0].localeCompare(b[0]));
    
    for (const [key, node] of entries) {
      const path = prefix + key;
      // Skip node_modules and hidden files if necessary, but for now include everything provided
      if ((node as any).file) {
        summary += `${path}\n`;
      } else if ((node as any).directory) {
        // We recurse but don't explicitly list the directory name as a separate line if it's implied by children
        // But for empty dirs it might be useful?
        // Let's just recurse.
        summary += this.generateTreeSummary((node as any).directory, path + '/');
      }
    }
    return summary;
  }
}
