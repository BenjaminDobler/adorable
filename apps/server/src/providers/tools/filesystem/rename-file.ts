import { Tool } from '../types';

export const renameFile: Tool = {
  definition: {
    name: 'rename_file',
    description: 'Rename or move a file to a new path within the project.',
    input_schema: {
      type: 'object',
      properties: {
        old_path: { type: 'string', description: 'The current path of the file.' },
        new_path: { type: 'string', description: 'The new path for the file.' }
      },
      required: ['old_path', 'new_path']
    },
  },

  async execute(args, ctx) {
    const fileContent = await ctx.fs.readFile(args.old_path);
    await ctx.fs.writeFile(args.new_path, fileContent);
    ctx.callbacks.onFileWritten?.(args.new_path, fileContent);
    await ctx.fs.deleteFile(args.old_path);
    return { content: `File renamed from ${args.old_path} to ${args.new_path}`, isError: false };
  },

  getActivityDescription(args) {
    return `Renaming ${args.old_path || 'file'}`;
  },
};
