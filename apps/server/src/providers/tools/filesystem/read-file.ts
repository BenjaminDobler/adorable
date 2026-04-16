import { Tool } from '../types';
import { validateToolArgs, contentHash } from '../utils';
import * as fs from 'fs/promises';
import * as path from 'path';

export const readFile: Tool = {
  definition: {
    name: 'read_file',
    description: 'Reads the content of a single file. Prefer read_files when you need to read multiple files.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file to read.' }
      },
      required: ['path']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const error = validateToolArgs('read_file', args, ['path']);
    if (error) return { content: error, isError: true };
    const content = await ctx.fs.readFile(args.path);

    // Track read for staleness detection
    try {
      const fullPath = path.resolve((ctx.fs as any).projectPath || '.', args.path);
      const stat = await fs.stat(fullPath);
      ctx.readFileState.set(args.path, {
        mtime: stat.mtimeMs,
        contentHash: contentHash(content),
        partial: false,
      });
    } catch { /* non-disk FS, skip tracking */ }

    return { content, isError: false };
  },

  getActivityDescription(args) {
    return `Reading ${args.path || 'file'}`;
  },
};
