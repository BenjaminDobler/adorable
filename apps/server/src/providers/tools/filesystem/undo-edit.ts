import { Tool } from '../types';
import { validateToolArgs, contentHash } from '../utils';
import * as fs from 'fs/promises';
import * as path from 'path';

export const undoEdit: Tool = {
  definition: {
    name: 'undo_edit',
    description: 'Restore a file to its state before the last edit. Only works for files modified in this session via edit_file or write_file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file to restore.' }
      },
      required: ['path']
    },
  },

  async execute(args, ctx) {
    const error = validateToolArgs('undo_edit', args, ['path']);
    if (error) return { content: error, isError: true };

    const history = ctx.fileHistory.get(args.path);
    if (!history) {
      return { content: `No edit history for "${args.path}". The file was not modified in this session.`, isError: true };
    }

    await ctx.fs.writeFile(args.path, history.content);
    ctx.callbacks.onFileWritten?.(args.path, history.content);

    // Update read state
    try {
      const fullPath = path.resolve((ctx.fs as any).projectPath || '.', args.path);
      const stat = await fs.stat(fullPath);
      ctx.readFileState.set(args.path, {
        mtime: stat.mtimeMs,
        contentHash: contentHash(history.content),
        partial: false,
      });
    } catch { /* skip */ }

    // Remove from history (only one level of undo)
    ctx.fileHistory.delete(args.path);

    return { content: `Restored "${args.path}" to its state before the last edit.`, isError: false };
  },

  getActivityDescription(args) {
    return `Undoing edit to ${args.path || 'file'}`;
  },
};
