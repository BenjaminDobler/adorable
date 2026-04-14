import { Tool } from '../types';
import { validateToolArgs } from '../utils';

export const grep: Tool = {
  definition: {
    name: 'grep',
    description: 'Search for a string or pattern in files',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'The string or regex pattern to search for.' },
        path: { type: 'string', description: 'The path to search in (directory or file). Defaults to root.' },
        case_sensitive: { type: 'boolean', description: 'Whether the search is case sensitive.' }
      },
      required: ['pattern']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const error = validateToolArgs('grep', args, ['pattern']);
    if (error) return { content: error, isError: true };

    const results = await ctx.fs.grep(args.pattern, args.path, args.case_sensitive);
    return { content: results.length ? results.join('\n') : 'No matches found.', isError: false };
  }
};
