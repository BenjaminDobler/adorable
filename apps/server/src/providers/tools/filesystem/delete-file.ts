import { Tool } from '../types';
import { validateToolArgs } from '../utils';

export const deleteFile: Tool = {
  definition: {
    name: 'delete_file',
    description: 'Delete a file from the project. Cannot delete critical config files (package.json, angular.json, tsconfig.json).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file to delete.' }
      },
      required: ['path']
    },
  },

  async execute(args, ctx) {
    const error = validateToolArgs('delete_file', args, ['path']);
    if (error) return { content: error, isError: true };

    const protectedFiles = ['package.json', 'angular.json', 'tsconfig.json', 'tsconfig.app.json'];
    const fileName = args.path.split('/').pop();
    if (protectedFiles.includes(fileName)) {
      return { content: `Error: Cannot delete protected file: ${args.path}`, isError: true };
    }

    await ctx.fs.deleteFile(args.path);
    return { content: `File deleted: ${args.path}`, isError: false };
  }
};
