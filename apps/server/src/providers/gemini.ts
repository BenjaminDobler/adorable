import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import { GoogleGenAI } from '@google/genai';
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
+"- Use `write_file` to create or update files.\n\n"
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

export class GeminiProvider extends BaseLLMProvider implements LLMProvider {
  async generate(options: GenerateOptions): Promise<any> {
    let text = '';
    await this.streamGenerate(options, {
        onText: (t) => text += t,
        onToolResult: () => {},
    });
    return { explanation: text, files: this.lastAccumulatedFiles };
  }
  
  private lastAccumulatedFiles: any = {};

  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    const { prompt, previousFiles, apiKey, model } = options;
    if (!apiKey) throw new Error('Google Generative AI Key is required');

    // Use the new @google/genai client
    const client = new GoogleGenAI({ apiKey });
    
    // Map TOOLS to new SDK format
    const tools: any[] = TOOLS.map(tool => ({
        functionDeclarations: [{
            name: tool.name,
            description: tool.description,
            parameters: {
                type: 'OBJECT',
                properties: Object.entries(tool.input_schema.properties).reduce((acc, [key, prop]: [string, any]) => ({
                    ...acc,
                    [key]: { 
                        type: prop.type === 'string' ? 'STRING' : 'OBJECT',
                        description: prop.description 
                    }
                }), {}),
                required: tool.input_schema.required
            }
        }]
    }));

    // Prepare initial context
    let userMessage = prompt;
    if (previousFiles) {
      const treeSummary = this.generateTreeSummary(previousFiles);
      userMessage += `\n\n--- Current File Structure ---\n${treeSummary}`;
    }

    const initialParts: any[] = [{ text: userMessage }];
    if (options.images && options.images.length > 0) {
      options.images.forEach(img => {
        const match = img.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
        if (match) {
          initialParts.push({ inlineData: { mimeType: `image/${match[1]}`, data: match[2] } });
        }
      });
    }

    // Chat history
    const history: any[] = [
        { role: 'user', parts: initialParts }
    ];

    const fileMap = this.flattenFiles(previousFiles || {});
    const accumulatedFiles: any = {};
    this.lastAccumulatedFiles = accumulatedFiles;
    let fullExplanation = '';
    let turnCount = 0;
    const MAX_TURNS = 10;
    
    while (turnCount < MAX_TURNS) {
        const responseStream = await client.models.generateContentStream({
            model: model || 'gemini-2.0-flash-exp',
            contents: history,
            config: {
                systemInstruction: ANGULAR_KNOWLEDGE_BASE + "\n\n" + SYSTEM_PROMPT,
                tools: tools,
                maxOutputTokens: 8192 
            }
        });

        const currentTurnParts: any[] = [];

        for await (const chunk of responseStream) {
            // Usage tracking
            if (chunk.usageMetadata) {
                callbacks.onTokenUsage?.({
                    inputTokens: chunk.usageMetadata.promptTokenCount || 0,
                    outputTokens: chunk.usageMetadata.candidatesTokenCount || 0,
                    totalTokens: chunk.usageMetadata.totalTokenCount || 0
                });
            }

            // Text streaming
            const text = chunk.text;
            if (text) {
                fullExplanation += text;
                callbacks.onText?.(text);
            }

            // Accumulate parts for history
            if (chunk.candidates?.[0]?.content?.parts) {
                currentTurnParts.push(...chunk.candidates[0].content.parts);
            }
        }

        // Check if we got any content
        if (currentTurnParts.length === 0) break;

        // Add assistant response to history
        const modelContent = { role: 'model', parts: currentTurnParts };
        history.push(modelContent);

        // Extract function calls
        const functionCalls = currentTurnParts
            .filter(part => part.functionCall)
            .map(part => part.functionCall!);

        if (functionCalls.length === 0) {
            break;
        }

        // Execute tools
        const functionResponses: any[] = [];
        for (const call of functionCalls) {
            callbacks.onToolCall?.(0, call.name!, call.args);
            
            let content = '';
            const args = call.args as any;
            
            if (call.name === 'write_file') {
                this.addFileToStructure(accumulatedFiles, args.path, args.content);
                content = 'File created successfully.';
            } else if (call.name === 'read_file') {
                content = fileMap[args.path] || 'Error: File not found.';
            } else if (call.name === 'list_dir') {
                let dir = args.path;
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
            }

            callbacks.onToolResult?.('gemini-tool', content);
            
            functionResponses.push({
                functionResponse: {
                    name: call.name,
                    response: { content }
                }
            });
        }
        
        history.push({ role: 'user', parts: functionResponses });
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

  private generateTreeSummary(structure: any, prefix = ''): string {
    let summary = '';
    const entries = Object.entries(structure).sort((a, b) => a[0].localeCompare(b[0]));
    
    for (const [key, node] of entries) {
      const path = prefix + key;
      if ((node as any).file) {
        summary += `${path}\n`;
      } else if ((node as any).directory) {
        summary += this.generateTreeSummary((node as any).directory, path + '/');
      }
    }
    return summary;
  }
}
