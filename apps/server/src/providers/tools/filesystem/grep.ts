import { z } from 'zod';
import { Tool } from '../types';
import { zodToToolSchema, semanticNumber, semanticBoolean } from '../zod-helpers';

const inputSchema = z.object({
  pattern: z.string().describe('The string or regex pattern to search for.'),
  path: z.string().optional().describe('The path to search in (directory or file). Defaults to project root.'),
  case_sensitive: semanticBoolean('Whether the search is case sensitive. Default: false.'),
  output_mode: z.enum(['content', 'files_with_matches', 'count']).optional()
    .describe('Output format: content (matching lines, default), files_with_matches (file paths only), count (match counts per file).'),
  head_limit: semanticNumber('Max results to return. Default: 200.'),
  offset: semanticNumber('Skip first N results (for pagination). Default: 0.'),
});

type Input = z.infer<typeof inputSchema>;

export const grep: Tool = {
  definition: {
    name: 'grep',
    description: 'Search for a string or pattern in files. Supports output modes: content (matching lines with context), files_with_matches (just file paths), count (match counts per file). Supports pagination with head_limit and offset.',
    input_schema: zodToToolSchema(inputSchema),
    isReadOnly: true,
  },

  async execute(rawArgs, ctx) {
    let args: Input;
    try {
      args = inputSchema.parse(rawArgs);
    } catch (e: any) {
      return { content: `Invalid arguments: ${e.message}`, isError: true };
    }

    if (!args.pattern) return { content: "Error: 'pattern' is required.", isError: true };

    // Validate path exists if provided
    if (args.path) {
      try {
        const items = await ctx.fs.listDir(args.path).catch(() => null);
        if (items === null) {
          await ctx.fs.readFile(args.path).catch(() => {
            throw new Error(`Path not found: "${args.path}". Check the path and try again.`);
          });
        }
      } catch (e: any) {
        if (e.message.includes('Path not found')) {
          return { content: e.message, isError: true };
        }
      }
    }

    const results = await ctx.fs.grep(args.pattern, args.path, args.case_sensitive ?? false);
    if (results.length === 0) {
      return { content: 'No matches found.', isError: false };
    }

    const mode = args.output_mode || 'content';
    const limit = args.head_limit ?? 200;
    const offset = args.offset ?? 0;

    if (mode === 'files_with_matches') {
      const files = [...new Set(results.map(r => r.split(':')[0]))];
      const page = files.slice(offset, offset + limit);
      let content = page.join('\n');
      if (offset + limit < files.length) {
        content += `\n\n(Showing ${page.length} of ${files.length} files. Use offset=${offset + limit} to see more.)`;
      }
      return { content, isError: false };

    } else if (mode === 'count') {
      const counts = new Map<string, number>();
      for (const r of results) {
        const file = r.split(':')[0];
        counts.set(file, (counts.get(file) || 0) + 1);
      }
      const entries = [...counts.entries()].slice(offset, offset + limit);
      let content = entries.map(([f, c]) => `${f}: ${c} match${c > 1 ? 'es' : ''}`).join('\n');
      if (offset + limit < counts.size) {
        content += `\n\n(Showing ${entries.length} of ${counts.size} files. Use offset=${offset + limit} to see more.)`;
      }
      return { content, isError: false };

    } else {
      const page = results.slice(offset, offset + limit);
      let content = page.join('\n');
      if (offset + limit < results.length) {
        content += `\n\n(Showing ${page.length} of ${results.length} matches. Use offset=${offset + limit} to see more.)`;
      }
      return { content, isError: false };
    }
  },

  getActivityDescription(args) {
    return `Searching for "${(args.pattern || '').slice(0, 40)}"`;
  },
};
