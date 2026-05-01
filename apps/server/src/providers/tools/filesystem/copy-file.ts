import { Tool } from '../types';

export const copyFile: Tool = {
  definition: {
    name: 'copy_file',
    description: 'Copy a file to a new location within the project.',
    input_schema: {
      type: 'object',
      properties: {
        source_path: { type: 'string', description: 'The path of the file to copy.' },
        destination_path: { type: 'string', description: 'The destination path for the copy.' }
      },
      required: ['source_path', 'destination_path']
    },
  },

  async execute(args, ctx) {
    const fileContent = await ctx.fs.readFile(args.source_path);
    await ctx.fs.writeFile(args.destination_path, fileContent);
    ctx.callbacks.onFileWritten?.(args.destination_path, fileContent);
    return { content: `File copied from ${args.source_path} to ${args.destination_path}`, isError: false };
  },

  getActivityDescription(args) {
    return `Copying ${args.source_path || 'file'}`;
  },
};
