import { z } from 'zod';
import { Tool } from '../types';
import { zodToToolSchema, semanticNumber } from '../zod-helpers';

const inputSchema = z.object({
  pattern: z.string().describe('Glob pattern (e.g., "**/*.ts", "src/**/*.component.html")'),
  head_limit: semanticNumber('Max results to return. Default: 100.'),
  offset: semanticNumber('Skip first N results (for pagination). Default: 0.'),
});

export const glob: Tool = {
  definition: {
    name: 'glob',
    description: 'Find files matching a glob pattern. Supports pagination with head_limit and offset.',
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

    if (!args.pattern) return { content: "Error: 'pattern' is required.", isError: true };

    const matches = await ctx.fs.glob(args.pattern);
    if (matches.length === 0) {
      return { content: 'No files matched the pattern.', isError: false };
    }

    const limit = args.head_limit ?? 100;
    const offset = args.offset ?? 0;
    const total = matches.length;
    const page = matches.slice(offset, offset + limit);

    let content = page.join('\n');
    if (offset + limit < total) {
      content += `\n\n(Showing ${page.length} of ${total} files. Use offset=${offset + limit} to see more.)`;
    }
    return { content, isError: false };
  },

  getActivityDescription(args) {
    return `Finding files: ${(args.pattern || '').slice(0, 40)}`;
  },
};
