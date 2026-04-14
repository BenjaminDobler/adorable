import { Tool } from '../types';
import { validateToolArgs, tryParseJsonArray } from '../utils';

export const readFiles: Tool = {
  definition: {
    name: 'read_files',
    description: 'Reads MULTIPLE files at once. Use this instead of read_file when you need to inspect several files — it is much faster.',
    input_schema: {
      type: 'object',
      properties: {
        paths: { type: 'array', description: 'Array of file paths to read.', items: { type: 'string' } }
      },
      required: ['paths']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const parsed = tryParseJsonArray(args.paths);
    if (parsed) args.paths = parsed;

    const error = validateToolArgs('read_files', args, ['paths']);
    if (error || !Array.isArray(args.paths)) {
      return { content: error || "Error: Tool 'read_files' requires 'paths' to be an array. Your response may have been truncated.", isError: true };
    }

    const results: string[] = [];
    for (const p of args.paths) {
      try {
        const fileContent = await ctx.fs.readFile(p);
        results.push(`--- ${p} ---\n${fileContent}`);
      } catch (e: any) {
        results.push(`--- ${p} ---\nError: ${e.message}`);
      }
    }
    return { content: results.join('\n\n'), isError: false };
  }
};
