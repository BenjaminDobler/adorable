import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { LLMProvider, GenerateOptions, StreamCallbacks } from './types';
import { ClaudeCodeStreamParser } from './claude-code-stream-parser';
import { prisma } from '../db/prisma';
import { projectFsService } from '../services/project-fs.service';
import { generateTreeSummary } from './context-builder';
import { figmaBridge } from '../services/figma-bridge.service';

/**
 * ClaudeCodeProvider — runs Adorable's AI generation via the user's local
 * `claude` CLI (Claude Code). Desktop-only, opt-in.
 *
 * Does NOT extend BaseLLMProvider — Claude Code owns its own agentic loop,
 * context management, and built-in tools. This provider:
 *
 * 1. Sets up .mcp.json so Claude Code spawns the Adorable MCP server
 * 2. Generates/updates CLAUDE.md with project context
 * 3. Spawns `claude -p <prompt> --output-format stream-json`
 * 4. Parses the JSONL stream and translates events to StreamCallbacks
 * 5. Detects file writes from stream events → fires onFileWritten
 */
export class ClaudeCodeProvider implements LLMProvider {
  async streamGenerate(options: GenerateOptions, callbacks: StreamCallbacks): Promise<any> {
    // ── 1. Guard: desktop mode only ────────────────────────────────
    if (process.env['ADORABLE_DESKTOP_MODE'] !== 'true') {
      throw new Error('Claude Code provider is only available in desktop mode');
    }

    // ── 2. Resolve project path ────────────────────────────────────
    const projectPath = await this.resolveProjectPath(options.projectId);
    if (!projectPath) {
      throw new Error('Could not resolve project path');
    }

    // ── 3. Load existing session ID ────────────────────────────────
    let sessionId: string | null = null;
    if (options.projectId) {
      sessionId = await this.loadSessionId(options.projectId);
    }

    // ── 4. Generate bridge token & .mcp.json ───────────────────────
    const bridgeToken = crypto.randomBytes(16).toString('hex');
    process.env['ADORABLE_BRIDGE_TOKEN'] = bridgeToken;
    const mcpJsonPath = await this.writeMcpConfig(projectPath, bridgeToken, options.userId);

    // ── 5. Generate/update CLAUDE.md ───────────────────────────────
    // The adorable section is idempotent (replaced on each run) and persists
    // across crashes, so we don't need to restore the original.
    await this.writeClaudeMd(projectPath, options);

    // ── 5b. Copy Adorable skills into .claude/skills/ ────────────
    // Claude Code auto-discovers skills from .claude/skills/ in the project root.
    this.syncSkills(projectPath, options);

    // ── 6. Build the prompt ────────────────────────────────────────
    // When resuming a session, Claude Code already has the full history.
    // Only send the bare user prompt — don't duplicate context/history.
    const fullPrompt = sessionId
      ? options.prompt
      : this.buildPrompt(options);

    // ── 7. Handle images ───────────────────────────────────────────
    const tempImagePaths: string[] = [];
    if (options.images?.length) {
      for (let i = 0; i < options.images.length; i++) {
        const imgPath = await this.writeImageToTemp(options.images[i], i);
        if (imgPath) tempImagePaths.push(imgPath);
      }
    }

    // ── 8. Spawn claude CLI ────────────────────────────────────────
    const args = this.buildCliArgs(fullPrompt, sessionId, options.model, tempImagePaths, mcpJsonPath);
    const child = spawn('claude', args, {
      cwd: projectPath,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // ── 9. Parse stream-json ───────────────────────────────────────
    const parser = new ClaudeCodeStreamParser(callbacks, projectPath);
    let stderrBuffer = '';

    // Debug log: write raw claude output to a file for inspection
    const logPath = path.join(projectPath, '.adorable', 'claude-debug.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });
    logStream.write(`[${new Date().toISOString()}] Claude Code started\n`);
    logStream.write(`[args] ${args.join(' ')}\n\n`);
    console.log(`[ClaudeCode] Debug log: ${logPath}`);

    const resultPromise = new Promise<any>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        logStream.write(`[stdout] ${text}\n`);
        parser.feed(text);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;
        logStream.write(`[stderr] ${text}\n`);
      });

      child.on('error', (err) => {
        logStream.write(`[error] ${err.message}\n`);
        logStream.end();
        reject(new Error(`Failed to spawn claude: ${err.message}`));
      });

      child.on('close', async (code) => {
        logStream.write(`\n[${new Date().toISOString()}] Process exited with code ${code}\n`);
        logStream.end();
        parser.flush();

        // ── 10. Save session ID ──────────────────────────────────
        const newSessionId = parser.getSessionId();
        if (newSessionId && options.projectId) {
          await this.saveSessionId(options.projectId, newSessionId).catch(() => {});
        }

        // ── 11. Cleanup ──────────────────────────────────────────
        this.cleanupTempImages(tempImagePaths);

        if (code !== 0 && code !== null) {
          // Check if session expired
          if (stderrBuffer.includes('session') && stderrBuffer.includes('not found')) {
            // Session expired — clear it so next run starts fresh
            if (options.projectId) {
              await this.saveSessionId(options.projectId, null).catch(() => {});
            }
          }
          const errMsg = stderrBuffer.trim() || `claude exited with code ${code}`;
          reject(new Error(errMsg));
          return;
        }

        // ── 12. Return result ────────────────────────────────────
        resolve({
          explanation: parser.getExplanation(),
          files: {}, // Files are written to disk by Claude Code; client sees them via onFileWritten
          model: 'claude-code',
          modifiedFiles: parser.getModifiedFiles(),
        });
      });
    });

    // ── Cancellation: kill child on client disconnect ─────────────
    const killChild = () => {
      if (!child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 2000);
      }
    };

    // ── Safety timeout: kill if process runs too long (5 min) ────
    const processTimeout = setTimeout(() => {
      if (!child.killed) {
        console.warn('[ClaudeCode] Process timeout (5 min), killing');
        callbacks.onText?.('\n\n*[Generation timed out after 5 minutes]*');
        killChild();
      }
    }, 5 * 60 * 1000);
    child.on('close', () => clearTimeout(processTimeout));

    // Store kill function so the route can call it on disconnect
    (resultPromise as any).__killChild = killChild;

    return resultPromise;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private async resolveProjectPath(projectId?: string): Promise<string | null> {
    if (!projectId) return null;

    try {
      const project = await prisma.project.findFirst({
        where: { id: projectId },
        select: { externalPath: true },
      });

      if (project?.externalPath) {
        return project.externalPath;
      }

      const fsPath = projectFsService.getProjectPath(projectId);
      if (fs.existsSync(fsPath)) {
        return fsPath;
      }
    } catch {
      // Fall through
    }
    return null;
  }

  private async loadSessionId(projectId: string): Promise<string | null> {
    try {
      const project = await prisma.project.findFirst({
        where: { id: projectId },
        select: { claudeCodeSessionId: true },
      });
      return project?.claudeCodeSessionId || null;
    } catch {
      return null;
    }
  }

  private async saveSessionId(projectId: string, sessionId: string | null): Promise<void> {
    await prisma.project.update({
      where: { id: projectId },
      data: { claudeCodeSessionId: sessionId },
    });
  }

  private async writeMcpConfig(projectPath: string, _bridgeToken: string, userId?: string): Promise<string> {
    const serverPort = process.env['PORT'] || '3333';

    // Copy the stdio-bridge script into the project's .adorable/ directory.
    // This tiny script bridges stdio (Claude Code) ↔ HTTP SSE (Adorable's in-process MCP server).
    // The HTTP MCP server at /mcp has direct access to figmaBridge, CDP, etc. — no tokens needed.
    const dotDir = path.join(projectPath, '.adorable');
    if (!fs.existsSync(dotDir)) fs.mkdirSync(dotDir, { recursive: true });
    const bridgeDest = path.join(dotDir, 'mcp-bridge.mjs');

    const prodPath = path.join(__dirname, '../mcp/stdio-bridge.mjs');
    const workspaceRoot = this.findWorkspaceRoot();
    const devPath = path.join(workspaceRoot, 'apps/server/src/mcp/stdio-bridge.mjs');
    const srcPath = fs.existsSync(prodPath) ? prodPath : devPath;

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, bridgeDest);
      console.log(`[ClaudeCode] MCP bridge copied to ${bridgeDest}`);
    } else {
      console.warn(`[ClaudeCode] MCP bridge not found: tried ${prodPath} and ${devPath}`);
    }

    const mcpUrl = `http://localhost:${serverPort}/mcp${userId ? `?userId=${userId}` : ''}`;
    const mcpJsonPath = path.join(projectPath, '.mcp.json');

    // Merge with existing .mcp.json if present
    let existing: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(mcpJsonPath, 'utf-8');
      existing = JSON.parse(raw);
    } catch {
      // No existing .mcp.json
    }

    const merged = {
      ...existing,
      mcpServers: {
        ...((existing.mcpServers as Record<string, unknown>) || {}),
        adorable: {
          command: 'node',
          args: [bridgeDest],
          env: {
            ADORABLE_MCP_URL: mcpUrl,
          },
        },
      },
    };

    fs.writeFileSync(mcpJsonPath, JSON.stringify(merged, null, 2));

    // Ensure .mcp.json and .adorable/ are in .gitignore
    this.ensureGitignore(projectPath, ['.mcp.json', '.adorable/mcp-bridge.mjs', '.claude/skills/']);

    return mcpJsonPath;
  }

  private ensureGitignore(projectPath: string, entries: string[]): void {
    const gitignorePath = path.join(projectPath, '.gitignore');
    try {
      let content = '';
      try { content = fs.readFileSync(gitignorePath, 'utf-8'); } catch { /* new file */ }
      const lines = content.split('\n');
      const toAdd = entries.filter(e => !lines.some(l => l.trim() === e));
      if (toAdd.length > 0) {
        const suffix = content.endsWith('\n') || content === '' ? '' : '\n';
        fs.writeFileSync(gitignorePath, content + suffix + toAdd.join('\n') + '\n');
      }
    } catch {
      // Best effort
    }
  }

  private async readExistingClaudeMd(projectPath: string): Promise<string | null> {
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    try {
      return fs.readFileSync(claudeMdPath, 'utf-8');
    } catch {
      return null;
    }
  }

  private async writeClaudeMd(projectPath: string, options: GenerateOptions): Promise<void> {
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    const existingContent = await this.readExistingClaudeMd(projectPath);

    // Build Adorable context section
    const adorableSection = this.buildClaudeMdSection(options);

    if (existingContent) {
      // Replace existing adorable section or append
      const startMarker = '<!-- adorable:start -->';
      const endMarker = '<!-- adorable:end -->';
      const startIdx = existingContent.indexOf(startMarker);
      const endIdx = existingContent.indexOf(endMarker);

      if (startIdx !== -1 && endIdx !== -1) {
        // Replace existing section
        const before = existingContent.substring(0, startIdx);
        const after = existingContent.substring(endIdx + endMarker.length);
        fs.writeFileSync(claudeMdPath, `${before}${startMarker}\n${adorableSection}\n${endMarker}${after}`);
      } else {
        // Append
        fs.writeFileSync(claudeMdPath, `${existingContent}\n\n${startMarker}\n${adorableSection}\n${endMarker}\n`);
      }
    } else {
      // Create new file
      const startMarker = '<!-- adorable:start -->';
      const endMarker = '<!-- adorable:end -->';
      fs.writeFileSync(claudeMdPath, `${startMarker}\n${adorableSection}\n${endMarker}\n`);
    }
  }

  private buildClaudeMdSection(options: GenerateOptions): string {
    const parts: string[] = [];

    parts.push('## Adorable IDE Context');
    parts.push('');
    parts.push('This project is managed by Adorable IDE. You have access to MCP tools for browser inspection, Figma integration, and more.');
    parts.push('');

    // Angular project info
    parts.push('### Project');
    parts.push('- Framework: Angular 21 (standalone components, signals, zoneless change detection)');
    parts.push('- Styling: SCSS');
    if (options.selectedApp) {
      parts.push(`- Nx workspace app: ${options.selectedApp}`);
    }
    parts.push('');

    // Build command
    const buildCommand = options.buildCommand || 'npx @richapps/ong build';
    parts.push('### Build');
    parts.push(`- Build command: \`${buildCommand}\``);
    parts.push('- **Always run the build command after making changes** to verify they compile correctly.');
    parts.push('');

    // MCP Tools guidance
    parts.push('### Available MCP Tools (via adorable server)');
    parts.push('');
    parts.push('**Browser Preview Tools** — inspect the live preview of this Angular app:');
    parts.push('- `browse_screenshot` — take a screenshot of the live preview');
    parts.push('- `browse_evaluate` — run JavaScript in the preview');
    parts.push('- `browse_console` — read console logs/errors');
    parts.push('- `browse_navigate` — navigate to a route');
    parts.push('- `browse_click`, `type_text` — interact with the preview');
    parts.push('- `inspect_component` — inspect Angular components (ONG annotations)');
    parts.push('- `inspect_styles`, `inspect_dom`, `measure_element` — inspect elements');
    parts.push('- `inspect_routes`, `inspect_signals`, `inspect_errors` — inspect Angular runtime');
    parts.push('');

    // Figma tools
    if (options.figmaLiveConnected) {
      parts.push('**Figma Live Bridge** — Figma is connected! You can read design specs directly:');
      parts.push('- `figma_get_selection` — get the currently selected Figma nodes');
      parts.push('- `figma_get_node` — get a specific node by ID');
      parts.push('- `figma_export_node` — export as PNG or SVG');
      parts.push('- `figma_search_nodes` — search by name');
      parts.push('- `figma_get_fonts` — get fonts with CSS equivalents (use cssFontFamily, not Figma names)');
      parts.push('- `figma_get_variables` — get design tokens');
      parts.push('');
    }

    // Skills
    parts.push('**Skills & Lessons:**');
    parts.push('- `activate_skill` — activate specialized instructions (e.g., "figma-bridge")');
    parts.push('- `save_lesson` — save lessons learned about component patterns');
    parts.push('');

    // Preview route
    if (options.previewRoute) {
      parts.push(`### Current Preview Route: \`${options.previewRoute}\``);
      parts.push('');
    }

    // Visual editing (ONG annotations)
    parts.push('### Visual Editing (ONG Annotations)');
    parts.push('Elements in the preview have ONG annotations with source file locations. Use `inspect_component` to find exact file:line:col for any element, then edit the source directly.');
    parts.push('');

    // Kit info
    if (options.activeKit) {
      parts.push(`### Component Kit: ${options.activeKit.name}`);
      parts.push('Check `.adorable/components/` for component documentation and usage examples.');
      parts.push('');
    }

    return parts.join('\n');
  }

  private buildPrompt(options: GenerateOptions): string {
    const parts: string[] = [];

    // Plan mode: ask clarifying questions before coding
    if (options.planMode) {
      parts.push('[PLAN MODE] Before writing any code, analyze the request and ask clarifying questions. Create a detailed implementation plan. Only proceed with code changes after laying out the approach.\n\n');
    }

    // Main user prompt
    parts.push(options.prompt);

    // Add conversation context if available
    if (options.contextSummary) {
      parts.push(`\n\n<conversation_context>\n${options.contextSummary}\n</conversation_context>`);
    }

    // Add file structure context
    if (options.previousFiles) {
      try {
        const tree = generateTreeSummary(options.previousFiles);
        if (tree) {
          parts.push(`\n\n<file_structure>\n${tree}\n</file_structure>`);
        }
      } catch {
        // Skip if tree generation fails
      }
    }

    // Add open files context
    if (options.openFiles && Object.keys(options.openFiles).length > 0) {
      parts.push('\n\n<open_files>');
      for (const [filePath, content] of Object.entries(options.openFiles)) {
        parts.push(`\n--- ${filePath} ---\n${content}`);
      }
      parts.push('\n</open_files>');
    }

    // Add history context
    if (options.history?.length) {
      parts.push('\n\n<previous_conversation>');
      for (const msg of options.history) {
        parts.push(`${msg.role}: ${msg.text}`);
      }
      parts.push('</previous_conversation>');
    }

    return parts.join('');
  }

  private buildCliArgs(
    prompt: string,
    sessionId: string | null,
    model?: string,
    imagePaths?: string[],
    mcpConfigPath?: string
  ): string[] {
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      '--include-partial-messages',
      '--max-budget-usd', '5',
    ];

    // Pass MCP config explicitly so Claude Code loads it without approval prompts
    if (mcpConfigPath) {
      args.push('--mcp-config', mcpConfigPath);
    }

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    if (model && model !== 'claude-code') {
      // Claude Code --model accepts short names (opus, sonnet, haiku)
      // and full model IDs (claude-opus-4-6, claude-sonnet-4-5-20250929, etc.)
      // Pass through directly — no mapping needed.
      args.push('--model', model);
    }

    // Attach images if present
    if (imagePaths?.length) {
      for (const imgPath of imagePaths) {
        args.push('--image', imgPath);
      }
    }

    return args;
  }

  private async writeImageToTemp(dataUri: string, index: number): Promise<string | null> {
    try {
      // Parse data URI: data:image/png;base64,<data>
      const match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!match) return null;

      const ext = match[1];
      const base64 = match[2];
      const buffer = Buffer.from(base64, 'base64');
      const tmpPath = path.join(os.tmpdir(), `adorable-img-${Date.now()}-${index}.${ext}`);
      fs.writeFileSync(tmpPath, buffer);
      return tmpPath;
    } catch {
      return null;
    }
  }

  /**
   * Copy Adorable's built-in skills into the project's .claude/skills/ directory
   * so Claude Code auto-discovers them via its native skill system.
   * Only copies skills relevant to the current context (e.g., figma-live only if connected).
   */
  private syncSkills(projectPath: string, options: GenerateOptions): void {
    const workspaceRoot = this.findWorkspaceRoot();
    const srcSkillsDir = path.join(workspaceRoot, 'apps/server/src/assets/skills');
    const destSkillsDir = path.join(projectPath, '.claude', 'skills');

    if (!fs.existsSync(srcSkillsDir)) return;

    try {
      const skillDirs = fs.readdirSync(srcSkillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of skillDirs) {
        // Only copy figma-live skill if Figma is connected
        if (dir.name === 'figma-live' && !options.figmaLiveConnected) continue;

        const srcDir = path.join(srcSkillsDir, dir.name);
        const destDir = path.join(destSkillsDir, dir.name);

        // Create skill directory
        fs.mkdirSync(destDir, { recursive: true });

        // Copy all files in the skill directory
        const files = fs.readdirSync(srcDir, { withFileTypes: true })
          .filter(f => f.isFile());

        for (const file of files) {
          const srcFile = path.join(srcDir, file.name);
          const destFile = path.join(destDir, file.name);
          fs.copyFileSync(srcFile, destFile);
        }

        // Copy references/ subdirectory if it exists
        const refsDir = path.join(srcDir, 'references');
        if (fs.existsSync(refsDir)) {
          const destRefsDir = path.join(destDir, 'references');
          fs.mkdirSync(destRefsDir, { recursive: true });
          const refs = fs.readdirSync(refsDir, { withFileTypes: true }).filter(f => f.isFile());
          for (const ref of refs) {
            fs.copyFileSync(path.join(refsDir, ref.name), path.join(destRefsDir, ref.name));
          }
        }
      }
    } catch (err) {
      console.warn('[ClaudeCode] Failed to sync skills:', (err as Error).message);
    }
  }

  private cleanupTempImages(paths: string[]): void {
    for (const p of paths) {
      try {
        fs.unlinkSync(p);
      } catch {
        // Best effort
      }
    }
  }

  /**
   * Walk up from __dirname to find the workspace root (directory containing nx.json).
   */
  private findWorkspaceRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(dir, 'nx.json'))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    // Fallback: try stripping /dist/ from __dirname
    const distIdx = __dirname.indexOf('/dist/');
    if (distIdx !== -1) {
      return __dirname.substring(0, distIdx);
    }
    return process.cwd();
  }
}
