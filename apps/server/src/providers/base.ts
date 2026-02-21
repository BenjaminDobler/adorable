import { FileSystemInterface, StreamCallbacks, GenerateOptions } from './types';
import { jsonrepair } from 'jsonrepair';
import { TOOLS } from './tools';
import { ANGULAR_KNOWLEDGE_BASE } from './knowledge-base';
import { SkillRegistry } from './skills/skill-registry';
import { MemoryFileSystem } from './filesystem/memory-filesystem';
import { DebugLogger } from './debug-logger';
import { screenshotManager } from './screenshot-manager';
import { questionManager } from './question-manager';
import { MCPManager } from '../mcp/mcp-manager';
import { MCPToolResult } from '../mcp/types';
import { Kit } from './kits/types';
import { generateComponentCatalog, generateComponentDocFiles } from './kits/doc-generator';

export const SYSTEM_PROMPT =
"You are an expert Angular developer.\n"
+"Your task is to generate or modify the SOURCE CODE for an Angular application.\n\n"
+"**CONCISENESS:** Keep explanations brief (1-2 sentences). Focus on code, not commentary. Only provide detailed explanations if the user explicitly asks.\n\n"
+"**MINIMAL CHANGES:** Make ONLY the changes necessary to fulfill the user's request. Do not refactor, reorganize, or 'improve' code that already works. Once the build passes, your task is complete — do not continue making changes.\n\n"
+"**CRITICAL: Tool Use & Context**\n"
+"- **SKILLS:** Check the `activate_skill` tool. If a skill matches the user's request (e.g. 'angular-expert' for Angular tasks), you **MUST** activate it immediately before generating code.\n"
+"- The **full file structure** is already provided below. You do NOT need to call `list_dir` to explore it — it's already there. Only use `list_dir` if you need to check a specific directory that may have changed after writing files.\n"
+"- You **MUST** read the code of any file you plan to modify — UNLESS it's already in the \"Explicit Context\" section below. Files in Explicit Context are already provided; do NOT waste a turn re-reading them.\n"
+"- Use `read_files` (plural) to read multiple files at once — this is much faster than individual `read_file` calls.\n"
+"- **NEVER** guess the content of a file. Always read it first to ensure you have the latest version.\n"
+"- **DO NOT over-explore.** Read only the files you need to modify. Do NOT recursively list every directory. If you have the file structure, use `read_files` directly on the files you need. Start writing code as soon as possible — do not spend more than 2-3 turns reading/exploring.\n"
+"- Use `write_files` (plural) to create or update multiple files in a single call. This is MUCH faster. Always prefer `write_files` over `write_file`.\n"
+"- **PREFER `edit_file`** for modifications to existing files. Only use `write_file`/`write_files` for NEW files or when rewriting >50% of content. `edit_file` is faster and less error-prone. `old_str` must match exactly.\n"
+"- Use `delete_file` to remove files from the project. Use `rename_file` to move or rename files. Use `copy_file` to duplicate files.\n"
+"- **BATCH TOOL CALLS:** When multiple independent operations are needed (e.g., reading several unrelated files, or writing files that don't depend on each other), invoke ALL tools in a single response. Never make sequential calls for independent operations.\n"
+"- Use `run_command` to execute shell commands. **MANDATORY:** After you finish creating or modifying ALL components, you MUST run `npm run build` as your FINAL step to verify compilation. Do NOT end your turn without running the build. If the build fails (exit code != 0), read the error output, fix the file(s), and RE-RUN the build until it succeeds. If `run_command` is not available, you MUST manually verify: every import references an existing file, every `templateUrl` and `styleUrl` points to a file you created, every component used in a template is imported in that component's `imports` array, and the root `app.component.html` contains the correct top-level markup with router-outlet or child component selectors.\n\n"
+"**RESTRICTED FILES (DO NOT EDIT):**\n"
+"- `package.json`, `angular.json`, `tsconfig.json`, `tsconfig.app.json`: Do NOT modify these files unless you are explicitly adding a dependency or changing a build configuration.\n"
+"- **NEVER** overwrite `package.json` with a generic template. The project is already set up with Angular 21.\n"
+"- `src/index.html`: Contains Adorable runtime scripts between `<!-- ADORABLE_RUNTIME_SCRIPTS -->` markers. **NEVER** modify or remove these script blocks. You MAY add `<link>` tags for fonts/stylesheets or external `<script>` tags for CDN libraries in the `<head>`, but always preserve the existing runtime scripts.\n\n"
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
+"7. **Conciseness:** Minimize comments. Do NOT create README.md, CHANGELOG, or any documentation files.\n"
+"8. **Binary:** For small binary files (like icons), use the 'write_file' tool with base64 content. Prefer SVG for vector graphics.\n"
+"9. **Efficiency:** ALWAYS use `write_files` (plural) to write ALL files in as few calls as possible. Batch everything — component .ts, .html, .scss files all in one `write_files` call. Only fall back to single `write_file` if a single file is very large and risks truncation.\n"
+"10. **Truncation:** If you receive an error about 'No content provided' or 'truncated JSON', it means your response was too long. You MUST retry by breaking the task into smaller steps, such as writing the component logic first and then using `edit_file` to add the template, or splitting large files into multiple components.\n"
+"12. **STOP WHEN DONE:** Once the build passes and the requested feature works, STOP. Do NOT:\n"
+"    - Refactor working code 'for clarity' or 'best practices'\n"
+"    - Add features, improvements, or optimizations the user didn't ask for\n"
+"    - Rewrite code that already works just because you'd write it differently\n"
+"    - Keep iterating after a successful build — the task is COMPLETE\n"
+"    If the user wants changes, they will ask. Your job is to implement what was requested, verify it builds, and stop.\n"
+"11. **Visual Editing IDs:** Add a `data-elements-id` attribute to EVERY HTML element. Use ONLY static string values — NEVER use interpolation (`{{ }}`), property binding (`[attr.data-elements-id]`), or any dynamic expression. Use a descriptive naming convention: `{component}-{element}-{number}`. Example:\n"
+"    ```html\n"
+"    <div data-elements-id=\"card-container-1\" class=\"card\">\n"
+"      <h2 data-elements-id=\"card-title-1\">Title</h2>\n"
+"      <p data-elements-id=\"card-desc-1\">Description</p>\n"
+"      <button data-elements-id=\"card-btn-1\">Click me</button>\n"
+"    </div>\n"
+"    ```\n"
+"    Inside `@for` loops, use the SAME static ID for the repeated element (do NOT append `$index`):\n"
+"    ```html\n"
+"    @for (item of items; track item.id) {\n"
+"      <div data-elements-id=\"card-item-1\">{{ item.name }}</div>\n"
+"    }\n"
+"    ```\n"
+"    These IDs enable visual editing. Maintain existing IDs when editing templates.\n\n"
+"**CLARIFYING QUESTIONS:**\n"
+"When genuinely uncertain about requirements that would significantly impact implementation, use the `ask_user` tool. Examples:\n"
+"- Vague requests missing critical details (e.g., 'make it better' with no specifics)\n"
+"- Multiple valid interpretations that lead to very different implementations\n"
+"- Ambiguous references to features, styling, or data sources\n"
+"Do NOT overuse this tool - proceed with reasonable assumptions when the request is clear enough.\n";

export { ANGULAR_KNOWLEDGE_BASE };

export interface AgentLoopContext {
  fs: FileSystemInterface;
  callbacks: StreamCallbacks;
  skillRegistry: SkillRegistry;
  availableTools: any[];
  logger: DebugLogger;
  hasRunBuild: boolean;
  hasWrittenFiles: boolean;
  buildNudgeSent: boolean;
  fullExplanation: string;
  mcpManager?: MCPManager;
  failedBuildCount: number;
  activeKitName?: string;
}

export abstract class BaseLLMProvider {

  protected async prepareAgentContext(options: GenerateOptions, providerName: string): Promise<{
    fs: FileSystemInterface;
    skillRegistry: SkillRegistry;
    availableTools: any[];
    userMessage: string;
    effectiveSystemPrompt: string;
    logger: DebugLogger;
    maxTurns: number;
    mcpManager?: MCPManager;
    activeKitName?: string;
  }> {
    const logger = new DebugLogger(providerName);
    const fs: FileSystemInterface = options.fileSystem || new MemoryFileSystem(this.flattenFiles(options.previousFiles || {}));

    const skillRegistry = new SkillRegistry();

    let userMessage = options.prompt;

    if (options.forcedSkill) {
      const skill = skillRegistry.getSkill(options.forcedSkill);
      if (skill) {
        userMessage += `\n\n[SYSTEM INJECTION] The user has explicitly enabled the '${skill.name}' skill. You MUST follow these instructions:\n${skill.instructions}`;
      }
    }

    if (options.previousFiles) {
      const treeSummary = this.generateTreeSummary(options.previousFiles);
      userMessage += `\n\n--- Current File Structure ---\n${treeSummary}`;
    }

    if (options.openFiles) {
      userMessage += `\n\n--- Explicit Context (Files the user is looking at) ---\n`;
      for (const [path, content] of Object.entries(options.openFiles)) {
        userMessage += `<file path="${path}">\n${content}\n</file>\n`;
      }
    }

    // Plan Mode: Instruct AI to ask clarifying questions before coding
    if (options.planMode) {
      userMessage += `\n\n[PLAN MODE] Before writing any code, use the ask_user tool to gather requirements. Ask about:
- Styling preferences (colors, fonts, layout)
- Feature scope and priorities
- Data sources and formats
- Any ambiguous aspects of the request
Only proceed with implementation after receiving the user's answers.`;
    }

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

    // Initialize MCP Manager if configs provided
    let mcpManager: MCPManager | undefined;
    if (options.mcpConfigs && options.mcpConfigs.length > 0) {
      mcpManager = new MCPManager();
      try {
        await mcpManager.initialize(options.mcpConfigs);
        const mcpTools = await mcpManager.getAllTools();

        // Add MCP tools to available tools with [MCP] prefix in description
        for (const tool of mcpTools) {
          availableTools.push({
            name: tool.name,
            description: `[MCP] ${tool.description}`,
            input_schema: tool.inputSchema
          });
        }

        if (mcpTools.length > 0) {
          logger.log('MCP_INITIALIZED', { toolCount: mcpTools.length, serverCount: mcpManager.serverCount });
        }
      } catch (error) {
        logger.log('MCP_INIT_ERROR', { error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    // Inject component catalog + doc files if an active kit is provided
    let activeKit: Kit | undefined;
    if (options.activeKit) {
      activeKit = options.activeKit;

      const catalog = generateComponentCatalog(activeKit);
      const docFiles = generateComponentDocFiles(activeKit);
      const docFileCount = Object.keys(docFiles).length;

      if (catalog) {
        logger.log('KIT_CATALOG_INJECTED', { kitName: activeKit.name, catalogLength: catalog.length, docFiles: docFileCount });

        // Write doc files into the MemoryFileSystem so the AI can read_files them
        // Only write files that don't already exist (template/saved files take priority)
        for (const [path, content] of Object.entries(docFiles)) {
          try {
            await fs.readFile(path);
            // File already exists (from template or saved project) — skip
          } catch {
            // File doesn't exist — write the generated doc
            await fs.writeFile(path, content);
          }
        }

        // Append compact catalog to user message
        userMessage += `\n\n--- Component Library: ${activeKit.name} ---\n`;
        userMessage += catalog;
        userMessage += `\n\n**⚠️ MANDATORY — Component Documentation (READ BEFORE CODING):**\n`;
        userMessage += `This project uses the **${activeKit.name}** component library. You MUST follow this workflow:\n\n`;
        userMessage += `**Step 1: Read docs BEFORE writing any code.**\n`;
        userMessage += `- Start by reading \`.adorable/components/README.md\` to see all available component doc files.\n`;
        userMessage += `- Then read the docs for EVERY component you plan to use: \`read_files\` → \`.adorable/components/{ComponentName}.md\`\n`;
        userMessage += `- Batch-read multiple docs in one \`read_files\` call for efficiency.\n`;
        userMessage += `- The docs contain the **correct export names, import paths, selectors, inputs, outputs, and usage examples**.\n\n`;
        userMessage += `**Step 2: Only use components whose docs you have read.**\n`;
        userMessage += `- **NEVER guess** import paths, export names, selectors, or APIs. They are NOT obvious and will cause build failures.\n`;
        userMessage += `- If a component doc file doesn't exist under the exact name, check the README for the correct filename.\n`;
        userMessage += `- Copy import paths and selectors directly from the docs — do not improvise.\n\n`;
        userMessage += `**Step 3: Fix build errors by reading docs, NEVER by removing components.**\n`;
        userMessage += `- If a build fails due to a component import or API error, read (or re-read) the component's doc file to find the correct usage.\n`;
        userMessage += `- **NEVER remove or replace a library component with a plain HTML element.** Always fix the usage based on the docs.\n`;
        userMessage += `- If you cannot find the right component, check the README for similar component names.\n`;
        if (activeKit.designTokens) {
          userMessage += `- Design tokens: \`.adorable/design-tokens.md\`\n`;
        }
        if (activeKit.systemPrompt) {
          userMessage += `\n--- Kit Instructions ---\n${activeKit.systemPrompt}\n`;
        }
      } else {
        const storybookResource = activeKit.resources?.find((r: any) => r.type === 'storybook') as any;
        logger.log('KIT_CATALOG_EMPTY', {
          kitName: activeKit.name,
          hasStorybookResource: !!storybookResource,
          storybookStatus: storybookResource?.status,
          selectedComponentCount: storybookResource?.selectedComponentIds?.length || 0
        });
      }
    }

    const maxTurns = fs.exec ? 200 : 25;

    // Determine effective system prompt: kit override or default
    let effectiveSystemPrompt = activeKit?.baseSystemPrompt || SYSTEM_PROMPT;

    // When a component library kit is active, override the "don't explore" instruction
    if (activeKit) {
      effectiveSystemPrompt = effectiveSystemPrompt.replace(
        'do not spend more than 2-3 turns reading/exploring.',
        'However, when using a component library, you MUST spend turns reading component documentation files (`.adorable/components/*.md`) BEFORE writing code. This is an exception to the exploration limit — reading component docs is mandatory, not optional.'
      );
    }

    return { fs, skillRegistry, availableTools, userMessage, effectiveSystemPrompt, logger, maxTurns, mcpManager, activeKitName: activeKit?.name };
  }

  protected async addSkillTools(availableTools: any[], skillRegistry: SkillRegistry, fs: FileSystemInterface, userId?: string) {
    const skills = await skillRegistry.discover(fs, userId);
    if (skills.length > 0) {
      const skillDescriptions = skills.map(s => `- "${s.name}": ${s.description}`).join('\n');
      availableTools.push({
        name: 'activate_skill',
        description: `Activates a specialized agent skill. Choose from:\n${skillDescriptions}`,
        input_schema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The name of the skill to activate.',
              enum: skills.map(s => s.name)
            }
          },
          required: ['name']
        }
      });
    }
    return skills;
  }

  /**
   * Execute an MCP tool and format the result
   */
  protected async executeMCPTool(
    toolName: string,
    toolArgs: any,
    ctx: AgentLoopContext
  ): Promise<{ content: string; isError: boolean }> {
    if (!ctx.mcpManager) {
      return { content: 'MCP Manager not initialized', isError: true };
    }

    try {
      const result: MCPToolResult = await ctx.mcpManager.callTool(toolName, toolArgs);

      // Format MCP response for AI consumption
      const formattedContent = result.content
        .map(item => {
          if (item.type === 'text' && item.text) {
            return item.text;
          } else if (item.type === 'image' && item.data) {
            return `[Image: ${item.mimeType || 'image/png'}]`;
          } else if (item.type === 'resource') {
            return `[Resource: ${item.mimeType || 'unknown'}]`;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');

      return {
        content: formattedContent || 'Tool executed successfully',
        isError: result.isError || false
      };
    } catch (error) {
      return {
        content: `MCP tool error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isError: true
      };
    }
  }

  protected async executeTool(
    toolName: string,
    toolArgs: any,
    ctx: AgentLoopContext
  ): Promise<{ content: string; isError: boolean }> {
    // Check if this is an MCP tool
    if (ctx.mcpManager && ctx.mcpManager.isMCPTool(toolName)) {
      return this.executeMCPTool(toolName, toolArgs, ctx);
    }

    const { fs, callbacks, skillRegistry } = ctx;
    let content = '';
    let isError = false;

    try {
      // Validate required arguments for each tool before execution
      let validationError: string | null = null;

      switch (toolName) {
        case 'write_file':
          validationError = this.validateToolArgs(toolName, toolArgs, ['path', 'content']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          await fs.writeFile(toolArgs.path, toolArgs.content);
          callbacks.onFileWritten?.(toolArgs.path, toolArgs.content);
          ctx.hasWrittenFiles = true;
          content = 'File created successfully.';
          break;
        case 'write_files':
          // LLMs sometimes send the files array as a JSON string instead of a parsed array,
          // sometimes with trailing garbage like "] }" — use jsonrepair to handle malformed JSON
          if (typeof toolArgs.files === 'string') {
            try {
              toolArgs.files = JSON.parse(jsonrepair(toolArgs.files));
            } catch {
              // Will be caught by the Array.isArray check below
            }
          }
          if (!toolArgs.files || !Array.isArray(toolArgs.files)) {
            content = 'Error: No files array provided. Your JSON may have been truncated. Try writing fewer files per call, or use write_file for individual files.';
            isError = true;
          } else {
            let written = 0;
            const skipped: string[] = [];
            for (const f of toolArgs.files) {
              if (!f.path || !f.content) {
                skipped.push(f.path || 'unknown');
                continue;
              }
              await fs.writeFile(f.path, f.content);
              callbacks.onFileWritten?.(f.path, f.content);
              written++;
            }
            ctx.hasWrittenFiles = true;
            if (skipped.length > 0) {
              content = `${written} of ${toolArgs.files.length} files written. Skipped ${skipped.length} files with missing path or content (possible truncation): ${skipped.join(', ')}`;
            } else {
              content = `${written} of ${toolArgs.files.length} files written successfully.`;
            }
          }
          break;
        case 'edit_file':
          validationError = this.validateToolArgs(toolName, toolArgs, ['path', 'old_str', 'new_str']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          await fs.editFile(toolArgs.path, toolArgs.old_str, toolArgs.new_str);
          {
            const updatedContent = await fs.readFile(toolArgs.path);
            callbacks.onFileWritten?.(toolArgs.path, updatedContent);
          }
          content = 'File edited successfully.';
          break;
        case 'read_file':
          validationError = this.validateToolArgs(toolName, toolArgs, ['path']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          content = await fs.readFile(toolArgs.path);
          break;
        case 'read_files':
          if (typeof toolArgs.paths === 'string') {
            try { toolArgs.paths = JSON.parse(jsonrepair(toolArgs.paths)); } catch { /* handled below */ }
          }
          validationError = this.validateToolArgs(toolName, toolArgs, ['paths']);
          if (validationError || !Array.isArray(toolArgs.paths)) {
            content = validationError || "Error: Tool 'read_files' requires 'paths' to be an array. Your response may have been truncated.";
            isError = true;
            break;
          }
          {
            const readResults: string[] = [];
            for (const p of toolArgs.paths) {
              try {
                const fileContent = await fs.readFile(p);
                readResults.push(`--- ${p} ---\n${fileContent}`);
              } catch (e: any) {
                readResults.push(`--- ${p} ---\nError: ${e.message}`);
              }
            }
            content = readResults.join('\n\n');
          }
          break;
        case 'list_dir':
          validationError = this.validateToolArgs(toolName, toolArgs, ['path']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          {
            const items = await fs.listDir(toolArgs.path);
            content = items.length ? items.join('\n') : 'Directory is empty or not found.';
          }
          break;
        case 'glob':
          validationError = this.validateToolArgs(toolName, toolArgs, ['pattern']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          {
            const matches = await fs.glob(toolArgs.pattern);
            content = matches.length ? matches.join('\n') : 'No files matched the pattern.';
          }
          break;
        case 'grep':
          validationError = this.validateToolArgs(toolName, toolArgs, ['pattern']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          {
            const grepResults = await fs.grep(toolArgs.pattern, toolArgs.path, toolArgs.case_sensitive);
            content = grepResults.length ? grepResults.join('\n') : 'No matches found.';
          }
          break;
        case 'activate_skill':
          validationError = this.validateToolArgs(toolName, toolArgs, ['name']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          {
            const skill = skillRegistry.getSkill(toolArgs.name);
            if (skill) {
              content = `<activated_skill name="${skill.name}">\n${skill.instructions}\n</activated_skill>`;
            } else {
              content = `Error: Skill '${toolArgs.name}' not found.`;
              isError = true;
            }
          }
          break;
        case 'delete_file':
          validationError = this.validateToolArgs(toolName, toolArgs, ['path']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          {
            const protectedFiles = ['package.json', 'angular.json', 'tsconfig.json', 'tsconfig.app.json'];
            const fileName = toolArgs.path.split('/').pop();
            if (protectedFiles.includes(fileName)) {
              content = `Error: Cannot delete protected file: ${toolArgs.path}`;
              isError = true;
            } else {
              await fs.deleteFile(toolArgs.path);
              content = `File deleted: ${toolArgs.path}`;
            }
          }
          break;
        case 'rename_file':
          validationError = this.validateToolArgs(toolName, toolArgs, ['old_path', 'new_path']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          {
            const fileContent = await fs.readFile(toolArgs.old_path);
            await fs.writeFile(toolArgs.new_path, fileContent);
            callbacks.onFileWritten?.(toolArgs.new_path, fileContent);
            await fs.deleteFile(toolArgs.old_path);
            content = `File renamed from ${toolArgs.old_path} to ${toolArgs.new_path}`;
          }
          break;
        case 'copy_file':
          validationError = this.validateToolArgs(toolName, toolArgs, ['source_path', 'destination_path']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          {
            const fileContent = await fs.readFile(toolArgs.source_path);
            await fs.writeFile(toolArgs.destination_path, fileContent);
            callbacks.onFileWritten?.(toolArgs.destination_path, fileContent);
            content = `File copied from ${toolArgs.source_path} to ${toolArgs.destination_path}`;
          }
          break;
        case 'take_screenshot':
          {
            if (!callbacks.onScreenshotRequest) {
              content = 'Screenshot capture is not available in this environment.';
              isError = true;
            } else {
              try {
                const imageData = await screenshotManager.requestScreenshot(
                  (requestId) => callbacks.onScreenshotRequest!(requestId)
                );
                // Return a special marker with the image data that the provider can parse
                // Format: [SCREENSHOT:<base64>]
                content = `[SCREENSHOT:${imageData}]`;
              } catch (err: any) {
                content = `Failed to capture screenshot: ${err.message}`;
                isError = true;
              }
            }
          }
          break;
        case 'run_command':
          if (!fs.exec) throw new Error('run_command is not supported in this environment.');
          validationError = this.validateToolArgs(toolName, toolArgs, ['command']);
          if (validationError) {
            content = validationError;
            isError = true;
            break;
          }
          {
            const res = await fs.exec(toolArgs.command);
            content = `Exit Code: ${res.exitCode}\n\nSTDOUT:\n${res.stdout}\n\nSTDERR:\n${res.stderr}`;
            if (res.exitCode !== 0) isError = true;
            const isBuildCmd = toolArgs.command && toolArgs.command.includes('build');
            if (isBuildCmd) {
              ctx.hasRunBuild = true;
              if (res.exitCode !== 0) {
                ctx.failedBuildCount++;
                // After repeated build failures with an active kit, remind about docs
                if (ctx.activeKitName && ctx.failedBuildCount >= 2) {
                  const nudge = `\n\n🚨 **BUILD FAILURE #${ctx.failedBuildCount} — STOP AND READ THE DOCS.**\nYou have had ${ctx.failedBuildCount} consecutive build failures with the ${ctx.activeKitName} component library. You MUST:\n1. Identify which components are causing errors\n2. Read their documentation: \`read_files\` → \`.adorable/components/{ComponentName}.md\`\n3. Fix the imports, selectors, and APIs based on the docs\n**DO NOT remove or replace library components with plain HTML. DO NOT guess — read the docs.**`;
                  content += nudge;
                  ctx.logger.logText('BUILD_FAILURE_NUDGE', nudge, { failedBuildCount: ctx.failedBuildCount, activeKitName: ctx.activeKitName });
                }
              } else {
                ctx.failedBuildCount = 0; // Reset on success
              }
            }
          }
          break;
        case 'ask_user':
          {
            if (!callbacks.onQuestionRequest) {
              content = 'Question requests are not available in this environment.';
              isError = true;
            } else {
              try {
                validationError = this.validateToolArgs(toolName, toolArgs, ['questions']);
                if (validationError) {
                  content = validationError;
                  isError = true;
                  break;
                }
                const answers = await questionManager.requestAnswers(
                  toolArgs.questions,
                  toolArgs.context,
                  (requestId, questions, context) => callbacks.onQuestionRequest!(requestId, questions, context)
                );
                content = `User provided the following answers:\n${JSON.stringify(answers, null, 2)}`;
              } catch (err: any) {
                content = `Question request failed: ${err.message}`;
                isError = true;
              }
            }
          }
          break;
        default:
          content = `Error: Unknown tool ${toolName}`;
          isError = true;
      }
    } catch (err: any) {
      content = `Error: ${err.message}`;
      isError = true;
    }

    return { content, isError };
  }

  protected async postLoopBuildCheck(
    ctx: AgentLoopContext,
    sendMessageAndGetToolCalls: (userMessage: string) => Promise<{ toolCalls: { name: string; args: any; id: string }[]; text: string }>
  ): Promise<void> {
    const { fs, callbacks } = ctx;

    // Auto-build check in the no-tools-called path
    if (fs.exec && ctx.hasWrittenFiles && !ctx.hasRunBuild && !ctx.buildNudgeSent) {
      ctx.buildNudgeSent = true;
      console.log(`[AutoBuild] Running npm run build...`);
      callbacks.onText?.('\n\nVerifying build...\n');
      const buildResult = await fs.exec('npm run build');
      console.log(`[AutoBuild] Build result: exitCode=${buildResult.exitCode}`);

      if (buildResult.exitCode !== 0) {
        callbacks.onText?.('Build failed. Fixing errors...\n');
        const errorOutput = (buildResult.stderr || '') + '\n' + (buildResult.stdout || '');
        const fixMessage = `The build failed with the following errors. Fix ALL errors and then run \`npm run build\` again to verify.\n\n\`\`\`\n${errorOutput.slice(0, 4000)}\n\`\`\``;

        const FIX_TURNS = 5;
        let currentFixMessage = fixMessage;
        for (let fixTurn = 0; fixTurn < FIX_TURNS; fixTurn++) {
          console.log(`[AutoBuild] Fix turn ${fixTurn}`);
          const result = await sendMessageAndGetToolCalls(currentFixMessage);

          if (result.toolCalls.length === 0) break;

          for (const call of result.toolCalls) {
            callbacks.onToolCall?.(0, call.name, call.args);
            const { content, isError } = await this.executeTool(call.name, call.args, ctx);
            callbacks.onToolResult?.(call.id, content, call.name);

            if (call.name === 'run_command' && call.args?.command?.includes('build') && !isError) {
              console.log(`[AutoBuild] Fix build succeeded on fix turn ${fixTurn}`);
              ctx.hasRunBuild = true;
            }
          }

          if (ctx.hasRunBuild) break;
          currentFixMessage = 'Continue fixing the build errors.';
        }
      } else {
        callbacks.onText?.('Build successful.\n');
        console.log(`[AutoBuild] Build succeeded`);
        ctx.hasRunBuild = true;
      }
    }

    // Nudge ng serve by modifying a file inside the container via exec (not putArchive)
    // putArchive may not trigger inotify reliably, so we use shell commands directly
    if (fs.exec && ctx.hasWrittenFiles) {
      console.log('[AutoBuild] Nudging dev server via exec...');
      try {
        await fs.exec('cp src/main.ts src/main.ts.bak && echo "// nudge" >> src/main.ts && sleep 2 && mv src/main.ts.bak src/main.ts');
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Truncate older messages to stay within context limits.
   * Keeps the first message (user prompt) and last N messages intact,
   * truncates large tool inputs/results in the middle.
   */
  protected pruneMessages(messages: any[], keepRecentCount = 6): void {
    if (messages.length <= keepRecentCount + 1) return;

    const truncateThreshold = 2000; // chars
    const truncateTarget = 200;

    // Prune everything except first message and last keepRecentCount messages
    for (let i = 1; i < messages.length - keepRecentCount; i++) {
      const msg = messages[i];
      if (!msg.content || !Array.isArray(msg.content)) continue;

      for (const block of msg.content) {
        // Truncate tool_use inputs — keep schema-valid structure
        if (block.type === 'tool_use' && block.input) {
          if (block.name === 'write_files' && Array.isArray(block.input.files)) {
            block.input.files = block.input.files.map((f: any) => ({
              path: f.path,
              content: '[truncated]'
            }));
          } else if (block.name === 'write_file' && block.input.content?.length > truncateThreshold) {
            block.input.content = '[truncated]';
          } else if (block.name === 'read_files' || block.name === 'read_file') {
            // These are small, keep as-is
          } else if (block.name === 'run_command') {
            // Small, keep as-is
          }
        }
        // Truncate tool_result content (user messages)
        if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > truncateThreshold) {
          block.content = block.content.slice(0, truncateTarget) + `\n...[truncated ${block.content.length} chars]`;
        }
        // Truncate text blocks
        if (block.type === 'text' && typeof block.text === 'string' && block.text.length > truncateThreshold) {
          block.text = block.text.slice(0, truncateTarget) + `\n...[truncated ${block.text.length} chars]`;
        }
      }
    }
  }

  protected parseToolInput(input: string): any {
    // Handle empty input gracefully - this can happen when streaming is interrupted
    // after tool_use starts but before any input_json_delta events arrive
    if (!input || !input.trim()) {
      console.warn(`[ParseTool] Empty tool input received - possible streaming interruption or truncation`);
      return {};
    }

    try {
      return JSON.parse(input);
    } catch {
      try {
        const repaired = jsonrepair(input);
        console.log(`[ParseTool] JSON repaired (${input.length} chars)`);
        return JSON.parse(repaired);
      } catch (e: any) {
        console.error(`[ParseTool] JSON repair failed (${input.length} chars): ${e.message}`);
        console.error(`[ParseTool] Input preview: ${input.slice(0, 200)}...`);
        return {};
      }
    }
  }

  /**
   * Validates that required arguments are present for a tool call.
   * Returns an error message if validation fails, or null if valid.
   */
  protected validateToolArgs(toolName: string, toolArgs: any, required: string[]): string | null {
    const missing = required.filter(key => toolArgs[key] === undefined || toolArgs[key] === null || toolArgs[key] === '');
    if (missing.length > 0) {
      return `Error: Tool '${toolName}' missing required arguments: ${missing.join(', ')}. Your response may have been truncated. Try breaking the task into smaller steps.`;
    }
    return null;
  }

  protected parseResponse(text: string): any {
    const files: any = {};
    let explanation = '';

    const explanationMatch = text.match(/<explanation>([\s\S]*?)<\/explanation>/);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    }

    const fileRegex = /<file\s+path="([^"]+)"(?:\s+encoding="([^"]+)")?>([\s\S]*?)(?:<\/file>|$)/g;
    let match;

    while ((match = fileRegex.exec(text)) !== null) {
      const filePath = match[1];
      const encoding = match[2];
      let fileContent = match[3];
      fileContent = fileContent.trim();

      if (encoding !== 'base64') {
        const codeBlockMatch = fileContent.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
        if (codeBlockMatch) {
          fileContent = codeBlockMatch[1];
        } else {
          fileContent = fileContent.replace(/^```[\w-]*\n/, '').replace(/\n```$/, '');
        }
      }

      if (filePath && fileContent) {
        this.addFileToStructure(files, filePath, fileContent, encoding);
      }
    }

    return { files, explanation };
  }

  protected addFileToStructure(root: any, path: string, content: string, encoding?: string) {
    const parts = path.split('/');
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = { directory: {} };
      }
      if (!current[part].directory) {
        current[part].directory = {};
      }
      current = current[part].directory;
    }

    const fileName = parts[parts.length - 1];
    if (encoding === 'base64') {
      const ext = fileName.split('.').pop()?.toLowerCase() || 'bin';
      const mime = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'application/octet-stream';
      content = `data:${mime};base64,${content}`;
    }

    current[fileName] = { file: { contents: content } };
  }

  protected flattenFiles(structure: any, prefix = ''): Record<string, string> {
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

  protected generateTreeSummary(structure: any, prefix = ''): string {
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
