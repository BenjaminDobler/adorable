import { Tool } from '../types';
import { validateToolArgs } from '../utils';

export const grep: Tool = {
  definition: {
    name: 'grep',
    description: 'Search for a string or pattern in files. Supports output modes: content (matching lines with context), files_with_matches (just file paths), count (match counts per file). Supports pagination with head_limit and offset.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'The string or regex pattern to search for.' },
        path: { type: 'string', description: 'The path to search in (directory or file). Defaults to project root.' },
        case_sensitive: { type: 'boolean', description: 'Whether the search is case sensitive. Default: false.' },
        output_mode: {
          type: 'string',
          enum: ['content', 'files_with_matches', 'count'],
          description: 'Output format: content (matching lines, default), files_with_matches (file paths only), count (match counts per file).'
        },
        head_limit: { type: 'number', description: 'Max results to return. Default: 200.' },
        offset: { type: 'number', description: 'Skip first N results (for pagination). Default: 0.' },
      },
      required: ['pattern']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const error = validateToolArgs('grep', args, ['pattern']);
    if (error) return { content: error, isError: true };

    // Validate path exists if provided
    if (args.path) {
      try {
        // Check if path is accessible (file or directory)
        const items = await ctx.fs.listDir(args.path).catch(() => null);
        if (items === null) {
          // Maybe it's a file, not a dir — try reading it
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

    const results = await ctx.fs.grep(args.pattern, args.path, args.case_sensitive);
    if (results.length === 0) {
      return { content: 'No matches found.', isError: false };
    }

    const mode = args.output_mode || 'content';
    const limit = typeof args.head_limit === 'number' ? args.head_limit : 200;
    const offset = typeof args.offset === 'number' ? args.offset : 0;

    let output: string[];
    const totalCount = results.length;

    if (mode === 'files_with_matches') {
      // Extract unique file paths from "filepath:line:content" format
      const files = [...new Set(results.map(r => r.split(':')[0]))];
      output = files.slice(offset, offset + limit);
      const total = files.length;
      let content = output.join('\n');
      if (offset + limit < total) {
        content += `\n\n(Showing ${output.length} of ${total} files. Use offset=${offset + limit} to see more.)`;
      }
      return { content, isError: false };

    } else if (mode === 'count') {
      // Count matches per file
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
      // content mode (default)
      output = results.slice(offset, offset + limit);
      let content = output.join('\n');
      if (offset + limit < totalCount) {
        content += `\n\n(Showing ${output.length} of ${totalCount} matches. Use offset=${offset + limit} to see more.)`;
      }
      return { content, isError: false };
    }
  },

  getActivityDescription(args) {
    return `Searching for "${(args.pattern || '').slice(0, 40)}"`;
  },
};
