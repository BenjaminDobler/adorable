import { Tool } from '../types';
import { validateToolArgs } from '../utils';

export const editFile: Tool = {
  definition: {
    name: 'edit_file',
    description: 'Make a precise edit to a file. PREREQUISITE: You MUST call read_file/read_files on this file first. old_str must match the exact current content.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file to edit.' },
        old_str: { type: 'string', description: 'The exact string to find (must be unique in the file).' },
        new_str: { type: 'string', description: 'The string to replace it with.' }
      },
      required: ['path', 'old_str', 'new_str']
    },
  },

  async execute(args, ctx) {
    const error = validateToolArgs('edit_file', args, ['path', 'old_str', 'new_str']);
    if (error) return { content: error, isError: true };

    await ctx.fs.editFile(args.path, args.old_str, args.new_str);
    const updatedContent = await ctx.fs.readFile(args.path);
    ctx.callbacks.onFileWritten?.(args.path, updatedContent);
    if (!ctx.modifiedFiles.includes(args.path)) ctx.modifiedFiles.push(args.path);

    return { content: 'File edited successfully.', isError: false };
  }
};
