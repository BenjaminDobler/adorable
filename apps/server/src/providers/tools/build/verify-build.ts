import { Tool } from '../types';
import { sanitizeCommandOutput } from '../../sanitize-output';

export const verifyBuild: Tool = {
  definition: {
    name: 'verify_build',
    description: "Run the project's build command to check for compilation errors. Always use this after modifying files — it automatically runs the correct build command for the project type (Angular CLI, Nx monorepo, etc.).",
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
  },

  async execute(args, ctx) {
    if (!ctx.fs.exec) throw new Error('verify_build is not supported in this environment.');

    const buildCmd = ctx.buildCommand;
    console.log(`[VerifyBuild] Running: ${buildCmd}`);
    const res = await ctx.fs.exec(buildCmd);
    let content = sanitizeCommandOutput(buildCmd, res.stdout, res.stderr, res.exitCode);
    let isError = false;

    ctx.lastBuildOutput = content;
    if (res.exitCode !== 0) isError = true;
    ctx.hasRunBuild = true;

    if (res.exitCode !== 0) {
      ctx.failedBuildCount++;
      if (ctx.activeKitName && ctx.failedBuildCount >= 2) {
        const nudge = `\n\n🚨 **BUILD FAILURE #${ctx.failedBuildCount} — STOP AND READ THE DOCS.**\nYou have had ${ctx.failedBuildCount} consecutive build failures with the ${ctx.activeKitName} component library. You MUST:\n1. Identify which components are causing errors\n2. Read their documentation: \`read_files\` → \`.adorable/components/{ComponentName}.md\`\n3. Fix the imports, selectors, and APIs based on the docs\n4. Remember: import paths and HTML tags often DO NOT match (e.g. import from \`/text-area\` but tag is \`<ui5-textarea>\`)\n5. Use \`edit_file\` to fix the specific error — do NOT rewrite entire files\n6. \`read_file\` BEFORE \`edit_file\` to get the exact current content\n**DO NOT remove or replace library components with plain HTML. DO NOT guess — read the docs.**`;
        content += nudge;
        ctx.logger.logText('BUILD_FAILURE_NUDGE', nudge, { failedBuildCount: ctx.failedBuildCount, activeKitName: ctx.activeKitName });
      }
    } else {
      const priorFailures = ctx.failedBuildCount;
      ctx.failedBuildCount = 0;
      if (priorFailures >= 2 && ctx.activeKitName && ctx.activeKitId) {
        content += `\n\n✅ **Build succeeded after ${priorFailures} failures.** You just worked through a non-trivial issue with the ${ctx.activeKitName} library. If you discovered something that isn't obvious from the docs (wrong import path, required wrapper, missing config, etc.), call \`save_lesson\` now so future sessions don't hit the same wall.`;
      }
    }

    return { content, isError };
  }
};
