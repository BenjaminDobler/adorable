import { GenerateOptions, LLMProvider, StreamCallbacks } from './types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { minimatch } from 'minimatch';
import { BaseLLMProvider } from './base';
import { ANGULAR_KNOWLEDGE_BASE } from './knowledge-base';
import { DebugLogger } from './debug-logger';
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

export class GeminiProvider extends BaseLLMProvider implements LLMProvider {
  async generate(options: GenerateOptions): Promise<any> {
    let text = '';
    await this.streamGenerate(options, {
        onText: (t) => text += t,
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        onToolResult: () => {},
    });
    return { explanation: text, files: this.lastAccumulatedFiles };
  }
  
  private lastAccumulatedFiles: any = {};

  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    const logger = new DebugLogger('gemini');
    const { prompt, previousFiles, apiKey, model } = options;
    if (!apiKey) throw new Error('Gemini API Key is required');

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = model || 'gemini-2.0-flash-exp';
    
    const tools = TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }));

    const generativeModel = genAI.getGenerativeModel({ 
      model: modelName,
      tools: [{ functionDeclarations: tools as any }]
    });

    logger.log('START', { model: modelName, promptLength: prompt.length });

    // Initial message construction
    let userMessage = prompt;
    if (previousFiles) {
      const treeSummary = this.generateTreeSummary(previousFiles);
      userMessage += `\n\n--- Current File Structure ---\n${treeSummary}`;
    }

    const initialParts: any[] = [{ text: userMessage }];
    if (options.images && options.images.length > 0) {
      options.images.forEach(dataUri => {
        // Generic regex to capture mime type and base64 data
        const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const data = match[2];
          
          // Allow images, PDFs, and text files
          if (mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType.startsWith('text/')) {
             initialParts.push({ inlineData: { mimeType, data } });
          }
        }
      });
    }

    const chat = generativeModel.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: SYSTEM_PROMPT }]
        },
        {
          role: 'model',
          parts: [{ text: 'I understand. I am an expert Angular developer and I have read the system prompt and knowledge base.' }]
        }
      ]
    });

    // Keep the map for read_file execution
    const fileMap = this.flattenFiles(previousFiles || {});
    const accumulatedFiles: any = {};
    this.lastAccumulatedFiles = accumulatedFiles;
    let fullExplanation = '';
    let turnCount = 0;
    const MAX_TURNS = 10;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let currentParts = initialParts;

    while (turnCount < MAX_TURNS) {
      logger.log('TURN_START', { turn: turnCount });
      
      const result = await chat.sendMessageStream(currentParts);
      let functionCalls: any[] = [];
      let textResponse = '';

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          textResponse += chunkText;
          fullExplanation += chunkText;
          callbacks.onText?.(chunkText);
        }
        
        // Gemini returns function calls in the chunk object, not as text delta
        // We need to inspect the underlying candidates
        const calls = chunk.functionCalls();
        if (calls && calls.length > 0) {
           functionCalls.push(...calls);
           // Notify UI about tool usage (approximate since it's not streaming char-by-char)
           calls.forEach(call => {
              callbacks.onToolStart?.(0, call.name);
              // Send full input immediately as Gemini gives it parsed
              callbacks.onToolDelta?.(0, JSON.stringify(call.args));
           });
        }
        
        if (chunk.usageMetadata) {
            totalInputTokens = chunk.usageMetadata.promptTokenCount;
            totalOutputTokens = chunk.usageMetadata.candidatesTokenCount;
            callbacks.onTokenUsage?.({ 
                inputTokens: totalInputTokens, 
                outputTokens: totalOutputTokens, 
                totalTokens: chunk.usageMetadata.totalTokenCount 
            });
        }
      }

      logger.log('ASSISTANT_RESPONSE', { text: textResponse, functionCalls });

      if (functionCalls.length === 0) {
         logger.log('TURN_END_NO_TOOLS', { turn: turnCount });
         break;
      }

      // Execute tools
      const toolOutputs: any[] = [];
      
      for (const call of functionCalls) {
        const toolName = call.name;
        const toolArgs = call.args;
        let content = '';
        let isError = false;

        logger.log('EXECUTING_TOOL', { name: toolName, args: toolArgs });

        try {
           callbacks.onToolCall?.(0, toolName, toolArgs);

           if (toolName === 'write_file') {
             if (!toolArgs.content) {
                content = 'Error: No content provided. Please retry.';
                isError = true;
             } else {
                this.addFileToStructure(accumulatedFiles, toolArgs.path, toolArgs.content);
                content = 'File created successfully.';
             }
           } else if (toolName === 'edit_file') {
              const originalContent = fileMap[toolArgs.path];
              if (!originalContent) {
                content = 'Error: File not found. You must ensure the file exists before editing it.';
                isError = true;
              } else {
                if (originalContent.includes(toolArgs.old_str)) {
                   const newContent = originalContent.replace(toolArgs.old_str, toolArgs.new_str);
                   fileMap[toolArgs.path] = newContent; 
                   this.addFileToStructure(accumulatedFiles, toolArgs.path, newContent);
                   content = 'File edited successfully.';
                } else {
                   content = 'Error: old_str not found in file. Please ensure it matches exactly, including whitespace.';
                   isError = true;
                }
              }
           } else if (toolName === 'read_file') {
              content = fileMap[toolArgs.path] || 'Error: File not found. The file may not exist in the current project structure.';
              if (content.startsWith('Error:')) isError = true;
           } else if (toolName === 'list_dir') {
             // ... simplify list_dir logic for brevity or reuse ...
             let dir = toolArgs.path;
             if (dir === '.' || dir === './') dir = '';
             if (dir && !dir.endsWith('/')) dir += '/';
             const matching = Object.keys(fileMap)
               .filter(k => k.startsWith(dir))
               .map(k => {
                 const relative = k.substring(dir.length);
                 const parts = relative.split('/');
                 return parts.length > 1 ? parts[0] + '/' : parts[0];
               });
             const unique = Array.from(new Set(matching)).sort();
             content = unique.length ? unique.join('\n') : 'Directory is empty or not found.';
           } else if (toolName === 'glob') {
             const matchingFiles = Object.keys(fileMap).filter(path => minimatch(path, toolArgs.pattern));
             content = matchingFiles.length ? matchingFiles.join('\n') : 'No files matched the pattern.';
           }
        } catch (e) {
           content = `Error executing tool: ${e.message}`;
           isError = true;
        }
        
        logger.log('TOOL_RESULT', { name: toolName, result: content, isError });
        callbacks.onToolResult?.(toolName, content);

        toolOutputs.push({
            functionResponse: {
                name: toolName,
                response: { name: toolName, content: content }
            }
        });
      }
      
      // Gemini expects function responses in the next turn
      currentParts = toolOutputs;
      turnCount++;
    }
    
    return { explanation: fullExplanation, files: accumulatedFiles, model: modelName };
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
      if ((node as any).file) {
        summary += `${path}\n`;
      } else if ((node as any).directory) {
        summary += this.generateTreeSummary((node as any).directory, path + '/');
      }
    }
    return summary;
  }
}