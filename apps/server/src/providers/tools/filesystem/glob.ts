import { Tool } from '../types';
import { validateToolArgs } from '../utils';

export const glob: Tool = {
  definition: {
    name: 'glob',
    description: 'Find files matching a pattern',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts")' }
      },
      required: ['pattern']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const error = validateToolArgs('glob', args, ['pattern']);
    if (error) return { content: error, isError: true };

    const matches = await ctx.fs.glob(args.pattern);
    return { content: matches.length ? matches.join('\n') : 'No files matched the pattern.', isError: false };
  }
};
