import { Tool } from '../types';
import { validateToolArgs } from '../utils';
import { sanitizeCommandOutput } from '../../sanitize-output';

const SEARCH_COMMANDS = new Set(['find', 'grep', 'rg', 'ag', 'ack', 'locate', 'which', 'whereis']);
const READ_COMMANDS = new Set(['cat', 'head', 'tail', 'less', 'wc', 'stat', 'file', 'jq', 'awk', 'sort', 'diff']);
const LIST_COMMANDS = new Set(['ls', 'tree', 'du', 'df', 'pwd', 'echo', 'env', 'printenv']);

function categorizeCommand(command: string): 'search' | 'read' | 'list' | 'mutation' {
  const firstWord = command.trim().split(/\s+/)[0];
  if (SEARCH_COMMANDS.has(firstWord)) return 'search';
  if (READ_COMMANDS.has(firstWord)) return 'read';
  if (LIST_COMMANDS.has(firstWord)) return 'list';
  return 'mutation';
}

export const runCommand: Tool = {
  definition: {
    name: 'run_command',
    description: "Execute a shell command in the project environment. Use this to run tests, grep for information, or other commands. Returns stdout, stderr and exit code. Do NOT use this for build verification — use `verify_build` instead.",
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: "The shell command to execute (e.g. 'grep -r \"Component\" src', 'npm test')" }
      },
      required: ['command']
    },
  },

  async execute(args, ctx) {
    if (!ctx.fs.exec) throw new Error('run_command is not supported in this environment.');

    const error = validateToolArgs('run_command', args, ['command']);
    if (error) return { content: error, isError: true };

    const res = await ctx.fs.exec(args.command);
    let content = sanitizeCommandOutput(args.command, res.stdout, res.stderr, res.exitCode);
    let isError = false;

    if (res.exitCode !== 0) isError = true;

    const isBuildCmd = args.command && args.command.includes('build');
    if (isBuildCmd) {
      ctx.hasRunBuild = true;
      if (res.exitCode !== 0) {
        ctx.failedBuildCount++;
        // After repeated build failures with an active kit, remind about docs
        if (ctx.activeKitName && ctx.failedBuildCount >= 2) {
          const nudge = `\n\n🚨 **BUILD FAILURE #${ctx.failedBuildCount} — STOP AND READ THE DOCS.**\nYou have had ${ctx.failedBuildCount} consecutive build failures with the ${ctx.activeKitName} component library. You MUST:\n1. Identify which components are causing errors\n2. Read their documentation: \`read_files\` → \`.adorable/components/{ComponentName}.md\`\n3. Fix the imports, selectors, and APIs based on the docs\n4. Remember: import paths and HTML tags often DO NOT match (e.g. import from \`/text-area\` but tag is \`<ui5-textarea>\`)\n5. Use \`edit_file\` to fix the specific error — do NOT rewrite entire files\n6. \`read_file\` BEFORE \`edit_file\` to get the exact current content\n**DO NOT remove or replace library components with plain HTML. DO NOT guess — read the docs.**`;
          content += nudge;
          ctx.logger.logText('BUILD_FAILURE_NUDGE', nudge, { failedBuildCount: ctx.failedBuildCount, activeKitName: ctx.activeKitName });
        }
      } else {
        // Build succeeded — nudge to save lessons if it followed failures
        const priorFailures = ctx.failedBuildCount;
        ctx.failedBuildCount = 0;
        if (priorFailures >= 2 && ctx.activeKitName && ctx.activeKitId) {
          content += `\n\n✅ **Build succeeded after ${priorFailures} failures.** You just worked through a non-trivial issue with the ${ctx.activeKitName} library. If you discovered something that isn't obvious from the docs (wrong import path, required wrapper, missing config, etc.), call \`save_lesson\` now so future sessions don't hit the same wall.`;
        }
      }
    }

    return { content, isError };
  },

  getActivityDescription(args) {
    const cmd = (args.command || '').split(/\s+/).slice(0, 3).join(' ');
    return `Running: ${cmd}`;
  },
};
