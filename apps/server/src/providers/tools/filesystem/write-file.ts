import { Tool } from '../types';
import { validateToolArgs, sanitizeFileContent } from '../utils';

export const writeFile: Tool = {
  definition: {
    name: 'write_file',
    description: 'Creates or updates a file in the project.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The full path to the file, relative to the project root (e.g., "src/app/app.component.ts").' },
        content: { type: 'string', description: 'The full content of the file.' }
      },
      required: ['path', 'content']
    },
  },

  async execute(args, ctx) {
    const error = validateToolArgs('write_file', args, ['path', 'content']);
    if (error) return { content: error, isError: true };

    args.content = sanitizeFileContent(args.content, args.path);
    const isRewrite = ctx.writtenFilesSet.has(args.path);
    await ctx.fs.writeFile(args.path, args.content);
    ctx.callbacks.onFileWritten?.(args.path, args.content);
    ctx.hasWrittenFiles = true;
    if (!ctx.modifiedFiles.includes(args.path)) ctx.modifiedFiles.push(args.path);
    ctx.writtenFilesSet.add(args.path);

    let content = 'File created successfully.';
    if (isRewrite) {
      content += '\n⚠ EFFICIENCY: You already wrote this file earlier in this session. For future modifications, use edit_file with targeted old_str/new_str instead of rewriting the entire file. This saves tokens and turns.';
    }
    return { content, isError: false };
  }
};
