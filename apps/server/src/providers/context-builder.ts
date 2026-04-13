import { FileSystemInterface, GenerateOptions, HistoryMessage, AgentLoopContext } from './types';
import { SYSTEM_PROMPT, VISUAL_EDITING_IDS_INSTRUCTION } from './system-prompts';
import { TOOLS, SAVE_LESSON_TOOL, CDP_TOOLS, FIGMA_TOOLS } from './tools';
import { SkillRegistry } from './skills/skill-registry';
import { DebugLogger } from './debug-logger';
import { MCPManager } from '../mcp/mcp-manager';
import { Kit } from './kits/types';
import { generateComponentCatalog } from './kits/doc-generator';
import { kitFsService } from '../services/kit-fs.service';
import { kitLessonService } from '../services/kit-lesson.service';

export const TREE_SKIP_DIRS = new Set([
  'node_modules', 'dist', '.angular', '.cache', '.git', '.adorable',
  '.nx', 'coverage', '.nyc_output', 'tmp', '.tmp', '__pycache__', '.tox',
]);

export function flattenFiles(structure: any, prefix = ''): Record<string, string> {
  const map: Record<string, string> = {};
  for (const key in structure) {
    const node = structure[key];
    const path = prefix + key;
    if (node.file) {
      map[path] = node.file.contents;
    } else if (node.directory) {
      Object.assign(map, flattenFiles(node.directory, path + '/'));
    }
  }
  return map;
}

export function generateTreeSummary(structure: any, prefix = ''): string {
  let summary = '';
  const entries = Object.entries(structure).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [key, node] of entries) {
    if ((node as any).directory && TREE_SKIP_DIRS.has(key)) continue;
    const path = prefix + key;
    if ((node as any).file) {
      summary += `${path}\n`;
    } else if ((node as any).directory) {
      summary += generateTreeSummary((node as any).directory, path + '/');
    }
  }
  return summary;
}

export async function addSkillTools(availableTools: any[], skillRegistry: SkillRegistry, fs: FileSystemInterface, userId?: string) {
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

    // Add read_skill_reference tool if any skill has references
    const skillsWithRefs = skills.filter(s => s.references && s.references.length > 0);
    if (skillsWithRefs.length > 0) {
      availableTools.push({
        name: 'read_skill_reference',
        description: 'Read a specific reference file from an activated skill. Use this after activating a skill to load reference documentation on demand.',
        input_schema: {
          type: 'object',
          properties: {
            skill_name: {
              type: 'string',
              description: 'The name of the skill.',
              enum: skillsWithRefs.map(s => s.name)
            },
            filename: {
              type: 'string',
              description: 'The filename of the reference file to read (as listed after skill activation).'
            }
          },
          required: ['skill_name', 'filename']
        }
      });
    }
  }
  return skills;
}

export async function prepareAgentContext(options: GenerateOptions, providerName: string): Promise<{
  fs: FileSystemInterface;
  skillRegistry: SkillRegistry;
  availableTools: any[];
  userMessage: string;
  effectiveSystemPrompt: string;
  logger: DebugLogger;
  maxTurns: number;
  mcpManager?: MCPManager;
  activeKitName?: string;
  activeKitId?: string;
  userId?: string;
  projectId?: string;
  history?: HistoryMessage[];
  contextSummary?: string;
  cdpEnabled?: boolean;
  buildCommand: string;
}> {
  const logger = new DebugLogger(providerName, options.projectId);
  if (!options.fileSystem) {
    throw new Error('fileSystem is required — every project must have a DiskFileSystem');
  }
  const fs: FileSystemInterface = options.fileSystem;

  const skillRegistry = new SkillRegistry();

  let userMessage = options.prompt;

  if (options.forcedSkill) {
    const skill = skillRegistry.getSkill(options.forcedSkill);
    if (skill) {
      userMessage += `\n\n[SYSTEM INJECTION] The user has explicitly enabled the '${skill.name}' skill. You MUST follow these instructions:\n${skill.instructions}`;
      if (skill.references && skill.references.length > 0) {
        userMessage += '\n\n[SKILL REFERENCE FILES - available on demand]\nUse the `read_skill_reference` tool to read any of these files when needed:\n' +
          skill.references.map(r => `- ${r.name}`).join('\n');
      }
    }
  }

  if (options.selectedApp) {
    userMessage += `\n\n--- Workspace Context ---\nThis is an Nx monorepo. The user is working on the app at \`${options.selectedApp}\`. `
      + `All file paths are relative to the workspace root. Focus changes on files inside \`${options.selectedApp}/\`. `
      + `When creating or modifying files, always use the full workspace-relative path (e.g. \`${options.selectedApp}/src/app/...\`). `
      + `Shared libraries may exist under \`libs/\` — use \`list_dir\` or \`run_command\` to explore them if needed.`;
  }

  if (options.previewRoute) {
    userMessage += `\n\n--- Currently Visible Page ---\nThe user is viewing the route \`${options.previewRoute}\` in the live preview. `
      + `When the user says "this page" or "here", they are referring to the component/page rendered at this route. `
      + `Check the routing configuration to identify which component is rendered at this path.`;
  }

  if (options.previousFiles) {
    const treeSummary = generateTreeSummary(options.previousFiles);
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

  const buildCommand = options.buildCommand || 'npm run build';

  const availableTools: any[] = [...TOOLS];
  if (fs.exec) {
    availableTools.push({
      name: "run_command",
      description: "Execute a shell command in the project environment. Use this to run tests, grep for information, or other commands. Returns stdout, stderr and exit code. Do NOT use this for build verification — use `verify_build` instead.",
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute (e.g. 'grep -r \"Component\" src', 'npm test')" }
        },
        required: ["command"]
      }
    });
    availableTools.push({
      name: "verify_build",
      description: "Run the project's build command to check for compilation errors. Always use this after modifying files — it automatically runs the correct build command for the project type (Angular CLI, Nx monorepo, etc.).",
      input_schema: {
        type: "object",
        properties: {},
        required: []
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

  // Add CDP browser tools when running in desktop mode with preview active
  if (options.cdpEnabled) {
    availableTools.push(...CDP_TOOLS);
  }

  // Add Figma live bridge tools when plugin is connected
  if (options.figmaLiveConnected) {
    availableTools.push(...FIGMA_TOOLS);
  }

  // Add save_lesson tool when a kit is active and lessons are enabled
  // Lessons enabled when both the kit author hasn't disabled it AND the user hasn't disabled it
  const lessonsEnabled = (options.activeKit?.lessonsEnabled !== false) && (options.kitLessonsEnabled !== false);
  if (options.activeKit && lessonsEnabled) {
    availableTools.push(SAVE_LESSON_TOOL);
  }

  // Inject component catalog + doc files if an active kit is provided
  let activeKit: Kit | undefined;
  if (options.activeKit) {
    activeKit = options.activeKit;

    const catalog = generateComponentCatalog(activeKit);

    // .adorable symlink is created at project save/load time (project.routes.ts).
    // Just count the doc files to decide whether to inject kit instructions.
    let docFileCount = 0;
    try {
      const docFiles = await kitFsService.readKitAdorableFiles(activeKit.id);
      docFileCount = Object.keys(docFiles).length;
    } catch { /* kit has no .adorable docs */ }

    if (docFileCount > 0) {
      logger.log('KIT_DOC_FILES_INJECTED', { kitName: activeKit.name, docFiles: docFileCount });
    }

    if (catalog) {
      logger.log('KIT_CATALOG_INJECTED', { kitName: activeKit.name, catalogLength: catalog.length, docFiles: docFileCount });

      // Append compact catalog to user message
      userMessage += `\n\n--- Component Library: ${activeKit.name} ---\n`;
      userMessage += catalog;
      userMessage += `\n\n**⚠️ MANDATORY — Component Documentation (READ BEFORE CODING):**\n`;
      userMessage += `This project uses the **${activeKit.name}** component library. You MUST follow this workflow:\n\n`;
      userMessage += `**Step 1: Read docs BEFORE writing any code.**\n`;
      userMessage += `- Read \`.adorable/components/README.md\` first — it lists all available component doc filenames. Do NOT use \`list_dir\` on \`.adorable/\` — the README has everything you need.\n`;
      userMessage += `- Then read the docs for EVERY component you plan to use: \`read_files\` → \`.adorable/components/{ComponentName}.md\`\n`;
      userMessage += `- Batch-read multiple docs in one \`read_files\` call for efficiency.\n`;
      userMessage += `- The docs contain the **correct export names, import paths, selectors, inputs, outputs, and usage examples**.\n\n`;
      userMessage += `**Step 2: Only use components whose docs you have read.**\n`;
      userMessage += `- **NEVER guess** import paths, export names, selectors, or APIs. They are NOT obvious and will cause build failures.\n`;
      userMessage += `- If a component doc file doesn't exist under the exact name, check the README for the correct filename.\n`;
      userMessage += `- Copy import paths and selectors directly from the docs — do not improvise.\n`;
      userMessage += `- **⚠️ CRITICAL: Import paths and HTML tags often DO NOT match.** For example, the import path might be \`/text-area\` while the HTML tag is \`<ui5-textarea>\`, or the import might be \`/list-item-standard\` while the tag is \`<ui5-li>\`. Always copy BOTH the import path AND the selector exactly from the doc.\n\n`;
      userMessage += `**Step 3: Fix build errors by reading docs, NEVER by removing components.**\n`;
      userMessage += `- If a build fails due to a component import or API error, read (or re-read) the component's doc file to find the correct usage.\n`;
      userMessage += `- **NEVER remove or replace a library component with a plain HTML element.** Always fix the usage based on the docs.\n`;
      userMessage += `- If you cannot find the right component, check the README for similar component names.\n`;
      if (activeKit.designTokens) {
        userMessage += `- Design tokens: \`.adorable/design-tokens.md\`\n`;
      }
    } else {
      const storybookResource = activeKit.resources?.find((r: any) => r.type === 'storybook') as any;
      logger.log('KIT_CATALOG_EMPTY', {
        kitName: activeKit.name,
        hasStorybookResource: !!storybookResource,
        storybookStatus: storybookResource?.status,
        selectedComponentCount: storybookResource?.selectedComponentIds?.length || 0,
        docFilesInjected: docFileCount
      });

      // Even without a catalog, if we have doc files, instruct the AI to use them
      if (docFileCount > 0) {
        userMessage += `\n\n--- Component Library: ${activeKit.name} ---\n`;
        userMessage += `\n**⚠️ MANDATORY — Component Documentation (READ BEFORE CODING):**\n`;
        userMessage += `This project uses the **${activeKit.name}** component library. You MUST follow this workflow:\n\n`;
        userMessage += `**Step 1: Read docs BEFORE writing any code.**\n`;
        userMessage += `- Read \`.adorable/components/README.md\` first — it lists all available component doc filenames. Do NOT use \`list_dir\` on \`.adorable/\` — the README has everything you need.\n`;
        userMessage += `- Then read the docs for EVERY component you plan to use: \`read_files\` → \`.adorable/components/{ComponentName}.md\`\n`;
        userMessage += `- Batch-read multiple docs in one \`read_files\` call for efficiency.\n`;
        userMessage += `- The docs contain the **correct export names, import paths, selectors, inputs, outputs, and usage examples**.\n\n`;
        userMessage += `**Step 2: Only use components whose docs you have read.**\n`;
        userMessage += `- **NEVER guess** import paths, export names, selectors, or APIs. They are NOT obvious and will cause build failures.\n`;
        userMessage += `- If a component doc file doesn't exist under the exact name, list the \`.adorable/\` directory to find available files.\n`;
        userMessage += `- Copy import paths and selectors directly from the docs — do not improvise.\n`;
        userMessage += `- **⚠️ CRITICAL: Import paths and HTML tags often DO NOT match.** For example, the import path might be \`/text-area\` while the HTML tag is \`<ui5-textarea>\`, or the import might be \`/list-item-standard\` while the tag is \`<ui5-li>\`. Always copy BOTH the import path AND the selector exactly from the doc.\n\n`;
        userMessage += `**Step 3: Fix build errors by reading docs, NEVER by removing components.**\n`;
        userMessage += `- If a build fails due to a component import or API error, read (or re-read) the component's doc file to find the correct usage.\n`;
        userMessage += `- **NEVER remove or replace a library component with a plain HTML element.** Always fix the usage based on the docs.\n`;
        if (activeKit.designTokens) {
          userMessage += `- Design tokens: \`.adorable/design-tokens.md\`\n`;
        }
      }
    }

    if (activeKit.systemPrompt) {
      userMessage += `\n--- Kit Instructions ---\n${activeKit.systemPrompt}\n`;
    }

    // Inject kit lessons (lessons learned) into context — only if enabled
    if (lessonsEnabled && options.userId) {
      try {
        const lessonSummary = await kitLessonService.generateLessonSummary(activeKit.id, options.userId);
        if (lessonSummary) {
          const lessonCount = lessonSummary.split('\n').length;
          userMessage += `\n--- Known Gotchas & Lessons for ${activeKit.name} (${lessonCount} lessons) ---\n`;
          userMessage += lessonSummary;
          userMessage += `\n\nRead full lesson details with read_files if you plan to use these components.\n`;
          logger.log('KIT_LESSONS_INJECTED', { kitName: activeKit.name, lessonCount });
        }
      } catch (err) {
        logger.log('KIT_LESSONS_ERROR', { error: err instanceof Error ? err.message : 'Unknown' });
      }

      // Instruct the LLM when to save lessons
      userMessage += `\n**Lessons Learned — \`save_lesson\` tool:**\n`;
      userMessage += `Call \`save_lesson\` when you discover something that would save time in future sessions. Specifically:\n`;
      userMessage += `- **After fixing a build error** caused by a wrong import path, incorrect selector, missing config, or API misuse with a kit component\n`;
      userMessage += `- **When a component requires a non-obvious workaround** (e.g., needs a wrapper element, specific parent context, or CSS override to work)\n`;
      userMessage += `- **When the docs are misleading or incomplete** and you had to figure out the correct usage by trial and error\n`;
      userMessage += `Do NOT save trivial things (typos, missing semicolons, standard Angular patterns). Only save kit-specific knowledge.\n`;
    }
  }

  const maxTurns = fs.exec ? 200 : 25;

  // Inject CDP browse tool instructions when available
  if (options.cdpEnabled) {
    userMessage += `\n\n**BROWSER TOOLS (Preview Debugging):**\n`
      + `You have access to browser tools that let you inspect the running application preview in real-time:\n`
      + `- \`browse_screenshot\` — Capture a screenshot to visually verify the UI\n`
      + `- \`browse_console\` — Read console errors/warnings from the running app\n`
      + `- \`browse_evaluate\` — Execute JavaScript in the preview to inspect DOM, check state, or debug\n`
      + `- \`browse_accessibility\` — Get the accessibility tree for structure analysis\n`
      + `- \`browse_navigate\` — Navigate to different routes to test them\n`
      + `- \`browse_click\` — Click elements to test interactivity\n`
      + `- \`inspect_component\` — Get the Angular component tree or details for a specific element\n`
      + `- \`inspect_performance\` — Start/stop profiling change detection cycles\n`
      + `- \`inspect_routes\` — Get route configuration and active route\n`
      + `- \`inspect_signals\` — Get the signal dependency graph (Angular 19+)\n`
      + `- \`inspect_errors\` — Parse build output into structured error objects (file, line, code, message)\n`
      + `- \`inspect_styles\` — Get computed CSS styles for an element (debug visibility, layout, sizing)\n`
      + `- \`inspect_network\` — Monitor HTTP requests (start/get/clear) to debug API calls\n`
      + `- \`inspect_dom\` — Get HTML subtree for a CSS selector\n`
      + `- \`measure_element\` — Get position, dimensions, and visibility of an element\n`
      + `- \`type_text\` — Type text into focused input fields (use after browse_click)\n`
      + `- \`inject_css\` — Inject temporary CSS for rapid visual testing\n`
      + `- \`clear_build_cache\` — Clear Angular/Nx build caches when phantom errors persist\n`
      + `- \`get_bundle_stats\` — Get bundle size breakdown\n`
      + `- \`get_container_logs\` — Get recent dev server logs\n\n`
      + `**VERIFICATION WORKFLOW:** After a successful build, you SHOULD:\n`
      + `1. Wait a few seconds for the dev server to reload, then use \`browse_screenshot\` to see the current state\n`
      + `2. Use \`browse_console\` to check for runtime errors\n`
      + `3. If the UI doesn't look right or has errors, fix the code and rebuild\n`
      + `4. For interactive features, use \`browse_click\` and \`browse_evaluate\` to test them\n`
      + `This is especially important when making visual/layout changes — always verify with a screenshot.\n`;
  }

  // Inject Figma live bridge instructions when connected
  if (options.figmaLiveConnected) {
    userMessage += `\n\n**FIGMA LIVE BRIDGE:**\n`
      + `A live connection to the user's Figma Desktop is active. You can directly inspect and interact with the Figma document:\n`
      + `- \`figma_get_selection\` — Get the current Figma selection with node structure and PNG images\n`
      + `- \`figma_get_node\` — Get a specific node by ID with its structure and optional PNG export\n`
      + `- \`figma_export_node\` — Export any node as a PNG image for visual comparison\n`
      + `- \`figma_select_node\` — Select a node in Figma and scroll it into view (highlights it for the user)\n`
      + `- \`figma_search_nodes\` — Search for nodes by name in the current Figma page\n`
      + `- \`figma_get_fonts\` — Get all fonts with correct CSS names, weights, CDN URLs, and icon codepoints. **CALL THIS FIRST before any code generation.**\n`
      + `- \`figma_get_variables\` — Extract design tokens (local variables) with resolved values per mode\n\n`
      + `**DESIGN-TO-CODE WORKFLOW:**\n`
      + `1. **FONTS FIRST**: Call \`figma_get_fonts\` to get exact CSS font-family names, font-weights, CDN/Google Fonts URLs, and icon codepoints. Figma internal names differ from CSS names (e.g., \`la-solid-900\` → \`font-family: 'Line Awesome Free'; font-weight: 900\`). Always use \`cssFontFamily\` and \`cssFontWeight\` — NEVER the raw Figma \`family\` name. NEVER substitute icon fonts with different libraries.\n`
      + `2. **DESIGN TOKENS**: Call \`figma_get_variables\` to get theme colors, spacing, typography tokens. Generate a CSS variables block (\`:root { --color-primary: ...; }\`) and use these variables throughout. If no variables exist, extract colors/spacing from the node fills and dimensions.\n`
      + `3. **GET SELECTION**: Call \`figma_get_selection\` to get the selected frame's structure (JSON only, no images). Then call \`figma_export_node\` once with scale=1 to get a single visual reference image. Do NOT export multiple images upfront — only export additional nodes as needed.\n`
      + `4. **INCREMENTAL FETCHING**: If the selection is large/complex (many children), DO NOT fetch the full tree. Use \`figma_get_node(id, depth=1)\` to map the skeleton, then drill into each section with \`figma_get_node(childId, depth=3)\`. This avoids timeouts and context bloat.\n`
      + `5. **ICON FONTS**: For TEXT nodes with \`isIconFont: true\` and \`iconCodepoint\`: render with CSS \`content: '\\fXXX'\` using the \`cssFontFamily\` from step 1. Use the exact codepoint — do not guess icon names.\n`
      + `6. **VECTOR ASSETS**: For GROUP, VECTOR, or INSTANCE nodes that are logos, illustrations, or complex graphics (not reproducible with CSS): call \`figma_export_node(nodeId, format="SVG")\` and inline the SVG in the template. NEVER render placeholder boxes.\n`
      + `7. **EXACT CONTENT**: Use the exact \`characters\` text from TEXT nodes — do not invent placeholder text. Use exact fill colors converted to hex. Use \`absoluteBoundingBox\` for dimensions.\n`
      + `8. **IMPLEMENT**: Generate the Angular component matching the design precisely. Load fonts via the CDN/Google Fonts URLs from step 1.\n`
      + `9. **VERIFY**: Use \`browse_screenshot\` (if available) to compare implementation with the Figma export. Fix any remaining discrepancies.\n\n`
      + `**CRITICAL EFFICIENCY RULES:**\n`
      + `- **Gather first, write once.** Read ALL existing files and ALL Figma data before writing any code. Then write ALL changes in one comprehensive batch. Do NOT do iterative screenshot→fix→screenshot loops.\n`
      + `- **Export Figma images ONCE.** Never re-export the same node ID. If you already exported it, reference the earlier result.\n`
      + `- **Maximum 2 screenshots per session.** One after initial implementation, one final verification. Not after every small change.\n`
      + `- **No partial fixes.** If you see 5 issues, fix all 5 in one write_files call. Do not fix one, screenshot, fix another, screenshot, etc.\n`
      + `- **Target: 5-8 turns total.** Fonts+tokens → selection+export → read existing → write all → build → verify. That's the whole session.\n\n`
      + `**FINDING MATCHING ELEMENTS:** When asked to find a matching Figma element for something in the app:\n`
      + `1. Take a screenshot of the app element with \`browse_screenshot\`\n`
      + `2. Use \`figma_search_nodes\` to find candidates by name\n`
      + `3. Use \`figma_export_node\` to visually compare candidates\n`
      + `4. Use \`figma_select_node\` to highlight the match in Figma\n`;

    if (options.figmaNodeAnnotations) {
      userMessage += `\n**FIGMA NODE ANNOTATIONS:** Add \`data-figma-node="<nodeId>"\` attributes to every HTML element that corresponds to a Figma node. `
        + `Use the node IDs returned by \`figma_get_selection\` or \`figma_get_node\` tool responses. `
        + `Parent frames should get their parent node ID, and children should get their own respective node IDs. `
        + `These attributes are used by the measurement overlay to compare the implementation against the Figma design specs.\n`;
    }
  }

  // Determine effective system prompt: kit override or default
  let effectiveSystemPrompt = activeKit?.baseSystemPrompt || SYSTEM_PROMPT;

  // Include visual editing IDs instruction for standard projects (not external projects
  // which use ong compile-time annotations instead)
  if (!options.skipVisualEditingIds) {
    effectiveSystemPrompt += VISUAL_EDITING_IDS_INSTRUCTION;
  }

  // Load project instructions from CLAUDE.md files (mirrors Claude Code behavior):
  // 1. CLAUDE.md at project root (checked into repo)
  // 2. .claude/CLAUDE.md (project-specific, often gitignored)
  const claudeMdSources = ['CLAUDE.md', '.claude/CLAUDE.md'];
  const claudeMdParts: string[] = [];
  for (const source of claudeMdSources) {
    try {
      const content = await fs.readFile(source);
      if (content?.trim()) {
        claudeMdParts.push(`<!-- ${source} -->\n${content}`);
      }
    } catch {
      // File doesn't exist — skip
    }
  }
  if (claudeMdParts.length > 0) {
    effectiveSystemPrompt += `\n\n--- Project Instructions (CLAUDE.md) ---\n${claudeMdParts.join('\n\n')}`;
  }

  // When a component library kit is active, override the "don't explore" instruction
  if (activeKit) {
    effectiveSystemPrompt = effectiveSystemPrompt.replace(
      'do not spend more than 2-3 turns reading/exploring.',
      'However, when using a component library, you MUST spend turns reading component documentation files (`.adorable/components/*.md`) BEFORE writing code. This is an exception to the exploration limit — reading component docs is mandatory, not optional.'
    );
  }

  return { fs, skillRegistry, availableTools, userMessage, effectiveSystemPrompt, logger, maxTurns, mcpManager, activeKitName: activeKit?.name, activeKitId: activeKit?.id, userId: options.userId, projectId: options.projectId, history: options.history, contextSummary: options.contextSummary, cdpEnabled: options.cdpEnabled, buildCommand };
}
