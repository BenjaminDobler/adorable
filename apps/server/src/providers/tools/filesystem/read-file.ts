import { Tool } from '../types';
import { validateToolArgs } from '../utils';

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
    return { content, isError: false };
  }
};
