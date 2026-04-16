import { Tool } from '../types';
import { validateToolArgs, sanitizeFileContent, contentHash } from '../utils';
import * as fs from 'fs/promises';
import * as path from 'path';

export const writeFile: Tool = {
  definition: {
    name: 'write_file',
    description: 'Creates or updates a file in the project.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The full path to the file, relative to the project root (e.g., "src/app/app.component.ts").' },
        content: { type: 'string', description: 'The full content of the file.' }
      },
      required: ['path', 'content']
    },
  },

  async execute(args, ctx) {
    const error = validateToolArgs('write_file', args, ['path', 'content']);
    if (error) return { content: error, isError: true };

    args.content = sanitizeFileContent(args.content, args.path);

    // --- Staleness warning (non-blocking) ---
    const warnings: string[] = [];
    const snapshot = ctx.readFileState.get(args.path);
    if (snapshot) {
      try {
        const fullPath = path.resolve((ctx.fs as any).projectPath || '.', args.path);
        const stat = await fs.stat(fullPath);
        if (stat.mtimeMs > snapshot.mtime) {
          const currentContent = await ctx.fs.readFile(args.path);
          if (contentHash(currentContent) !== snapshot.contentHash) {
            warnings.push('⚠ Warning: This file was modified externally since you last read it. Your write may overwrite those changes.');
          }
        }
      } catch { /* skip */ }

      if (snapshot.partial) {
        warnings.push('⚠ Warning: You only read part of this file (with offset/limit). Writing the full file may overwrite content you haven\'t seen.');
      }
    }

    // --- Save history for undo ---
    try {
      const previousContent = await ctx.fs.readFile(args.path);
      ctx.fileHistory.set(args.path, { content: previousContent, timestamp: Date.now() });
    } catch { /* new file, no history */ }

    const isRewrite = ctx.writtenFilesSet.has(args.path);
    await ctx.fs.writeFile(args.path, args.content);
    ctx.callbacks.onFileWritten?.(args.path, args.content);
    ctx.hasWrittenFiles = true;
    if (!ctx.modifiedFiles.includes(args.path)) ctx.modifiedFiles.push(args.path);
    ctx.writtenFilesSet.add(args.path);

    // Update read state after write
    try {
      const fullPath = path.resolve((ctx.fs as any).projectPath || '.', args.path);
      const stat = await fs.stat(fullPath);
      ctx.readFileState.set(args.path, {
        mtime: stat.mtimeMs,
        contentHash: contentHash(args.content),
        partial: false,
      });
    } catch { /* skip */ }

    let content = 'File created successfully.';
    if (isRewrite) {
      warnings.push('⚠ EFFICIENCY: You already wrote this file earlier in this session. For future modifications, use edit_file with targeted old_str/new_str instead of rewriting the entire file.');
    }
    if (warnings.length > 0) {
      content += '\n' + warnings.join('\n');
    }
    return { content, isError: false };
  },

  getActivityDescription(args) {
    return `Writing ${args.path || 'file'}`;
  },
};
