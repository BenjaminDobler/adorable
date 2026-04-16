import { z } from 'zod';
import { Tool } from '../types';
import { zodToToolSchema } from '../zod-helpers';
import { contentHash } from '../utils';
import * as fs from 'fs/promises';
import * as path from 'path';

const inputSchema = z.object({
  path: z.string().describe('The path to the file to read.'),
});

export const readFile: Tool = {
  definition: {
    name: 'read_file',
    description: 'Reads the content of a single file. Prefer read_files when you need to read multiple files.',
    input_schema: zodToToolSchema(inputSchema),
    isReadOnly: true,
  },

  async execute(rawArgs, ctx) {
    let args: z.infer<typeof inputSchema>;
    try {
      args = inputSchema.parse(rawArgs);
    } catch (e: any) {
      return { content: `Invalid arguments: ${e.message}`, isError: true };
    }

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
