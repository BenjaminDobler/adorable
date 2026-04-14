import { Tool } from '../types';
import { validateToolArgs } from '../utils';

export const listDir: Tool = {
  definition: {
    name: 'list_dir',
    description: 'Lists the files and folders in a directory to explore the project structure.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The directory path to list.' }
      },
      required: ['path']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const error = validateToolArgs('list_dir', args, ['path']);
    if (error) return { content: error, isError: true };

    const items = await ctx.fs.listDir(args.path);
    return { content: items.length ? items.join('\n') : 'Directory is empty or not found.', isError: false };
  }
};
