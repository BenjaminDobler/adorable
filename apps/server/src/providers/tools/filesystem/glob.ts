import { Tool } from '../types';
import { validateToolArgs } from '../utils';

export const glob: Tool = {
  definition: {
    name: 'glob',
    description: 'Find files matching a glob pattern. Supports pagination with head_limit and offset.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.component.html")' },
        head_limit: { type: 'number', description: 'Max results to return. Default: 100.' },
        offset: { type: 'number', description: 'Skip first N results (for pagination). Default: 0.' },
      },
      required: ['pattern']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const error = validateToolArgs('glob', args, ['pattern']);
    if (error) return { content: error, isError: true };

    const matches = await ctx.fs.glob(args.pattern);
    if (matches.length === 0) {
      return { content: 'No files matched the pattern.', isError: false };
    }

    const limit = typeof args.head_limit === 'number' ? args.head_limit : 100;
    const offset = typeof args.offset === 'number' ? args.offset : 0;
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
