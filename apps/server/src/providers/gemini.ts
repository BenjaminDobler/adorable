import { GenerateOptions, LLMProvider, StreamCallbacks, FileSystemInterface } from './types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLMProvider } from './base';
import { ANGULAR_KNOWLEDGE_BASE } from './knowledge-base';
import { DebugLogger } from './debug-logger';
import { TOOLS } from './tools';
import { MemoryFileSystem } from './filesystem/memory-filesystem';

const SYSTEM_PROMPT = 
"You are an expert Angular developer.\n"
+"Your task is to generate or modify the SOURCE CODE for an Angular application.\n\n"
+"**CRITICAL: Tool Use & Context**\n"
+"- You have access to the **FILE STRUCTURE ONLY** initially.\n"
+"- You **MUST** use the `read_file` tool to inspect the code of any file you plan to modify or need to understand.\n"
+"- **NEVER** guess the content of a file. Always read it first to ensure you have the latest version.\n"
+"- Use `write_file` to create or update files.\n"
+"- Use `edit_file` for precise modifications when you want to change a specific part of a file without rewriting the whole content. `old_str` must match exactly.\n"
+"- Use `run_command` if available to execute shell commands, run builds, or grep for information. Always inspect the output to verify success.\n\n"
+"**RESTRICTED FILES (DO NOT EDIT):**\n"
+"- `package.json`, `angular.json`, `tsconfig.json`, `tsconfig.app.json`: Do NOT modify these files unless you are explicitly adding a dependency or changing a build configuration.\n"
+"- **NEVER** overwrite `package.json` with a generic template. The project is already set up with Angular 21.\n\n"
+"Input Context:\n"
+"- You will receive the \"Current File Structure\".\n"
+"- If the user asks for a change, ONLY return the files that need to be modified or created.\n\n"
+"RULES:\n"
+"1. **Root Component:** Ensure 'src/app/app.component.ts' exists and has selector 'app-root'.\n"
+"2. **Features:** Use Angular 21+ Standalone components and signals.\n"
+"3. **Styling:** Use external stylesheets ('.scss' or '.css') for components. Do NOT use inline styles unless trivial.\n"
+"4. **Templates:** Use external templates ('.html') for components. Do NOT use inline templates unless trivial.\n"
+"5. **Modularity:** Break down complex UIs into smaller, reusable components. Avoid monolithic 'app.component.ts'.\n"
+"6. **Imports:** Ensure all imports are correct.\n"
+"7. **Conciseness:** Minimize comments.\n"
+"8. **Binary:** For small binary files (like icons), use the 'write_file' tool with base64 content. Prefer SVG for vector graphics.\n";

export class GeminiProvider extends BaseLLMProvider implements LLMProvider {
  async generate(options: GenerateOptions): Promise<any> {
    let text = '';
    const res = await this.streamGenerate(options, {
        onText: (t) => text += t,
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        onToolResult: () => {},
    });
    return { explanation: text, files: res.files };
  }
  
  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    const logger = new DebugLogger('gemini');
    const { prompt, previousFiles, apiKey, model, fileSystem } = options;
    if (!apiKey) throw new Error('Gemini API Key is required');

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = model || 'gemini-2.0-flash-exp';
    
    // Initialize File System
    const fs: FileSystemInterface = fileSystem || new MemoryFileSystem(this.flattenFiles(previousFiles || {}));

    // Prepare Tools
    const availableTools: any[] = [...TOOLS];
    if (fs.exec) {
       availableTools.push({
          name: "run_command",
          description: "Execute a shell command in the project environment. Use this to run build commands, tests, or grep for information. Returns stdout, stderr and exit code.",
          input_schema: {
             type: "object",
             properties: {
                command: { type: "string", description: "The shell command to execute (e.g. 'npm run build', 'grep -r \"Component\" src')" }
             },
             required: ["command"]
          }
       });
    }

    const tools = availableTools.map(tool => ({
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

    if (options.openFiles) {
      userMessage += `\n\n--- Explicit Context (Files the user is looking at) ---\n`;
      for (const [path, content] of Object.entries(options.openFiles)) {
        userMessage += `<file path="${path}">\n${content}\n</file>\n`;
      }
    }

    const initialParts: any[] = [{ text: userMessage }];
    if (options.images && options.images.length > 0) {
      options.images.forEach(dataUri => {
        const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const data = match[2];
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

    let fullExplanation = '';
    let turnCount = 0;
    const MAX_TURNS = 10;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let currentParts = initialParts;

    while (turnCount < MAX_TURNS) {
      logger.log('TURN_START', { turn: turnCount });
      
      const result = await chat.sendMessageStream(currentParts);
      const functionCalls: any[] = [];
      let textResponse = '';

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          textResponse += chunkText;
          fullExplanation += chunkText;
          callbacks.onText?.(chunkText);
        }
        
        const calls = chunk.functionCalls();
        if (calls && calls.length > 0) {
           functionCalls.push(...calls);
           calls.forEach(call => {
              callbacks.onToolStart?.(0, call.name);
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

           switch (toolName) {
                case 'write_file':
                    if (!toolArgs.content) throw new Error('No content provided for file.');
                    await fs.writeFile(toolArgs.path, toolArgs.content);
                    content = 'File created successfully.';
                    break;
                case 'edit_file':
                    await fs.editFile(toolArgs.path, toolArgs.old_str, toolArgs.new_str);
                    content = 'File edited successfully.';
                    break;
                case 'read_file':
                    content = await fs.readFile(toolArgs.path);
                    break;
                case 'list_dir':
                    const items = await fs.listDir(toolArgs.path);
                    content = items.length ? items.join('\n') : 'Directory is empty or not found.';
                    break;
                case 'glob':
                    const matches = await fs.glob(toolArgs.pattern);
                    content = matches.length ? matches.join('\n') : 'No files matched the pattern.';
                    break;
                case 'run_command':
                    if (!fs.exec) throw new Error('run_command is not supported in this environment.');
                    const res = await fs.exec(toolArgs.command);
                    content = `Exit Code: ${res.exitCode}\n\nSTDOUT:\n${res.stdout}\n\nSTDERR:\n${res.stderr}`;
                    if (res.exitCode !== 0) isError = true;
                    break;
                default:
                    content = `Error: Unknown tool ${toolName}`;
                    isError = true;
            }
        } catch (e: any) {
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
      
      currentParts = toolOutputs;
      turnCount++;
    }
    
    return { explanation: fullExplanation, files: fs.getAccumulatedFiles(), model: modelName };
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
