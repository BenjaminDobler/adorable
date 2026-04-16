import { Tool } from '../types';
import { sanitizeFileContent, tryParseJsonArray } from '../utils';

export const writeFiles: Tool = {
  definition: {
    name: 'write_files',
    description: 'Creates or updates MULTIPLE files at once. Use this instead of write_file when you need to create several files — it is much faster.',
    input_schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'Array of files to write.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The full path to the file, relative to the project root.' },
              content: { type: 'string', description: 'The full content of the file.' }
            },
            required: ['path', 'content']
          }
        }
      },
      required: ['files']
    },
  },

  async execute(args, ctx) {
    const parsed = tryParseJsonArray(args.files);
    if (parsed) args.files = parsed;

    if (!args.files || !Array.isArray(args.files)) {
      return { content: 'Error: No files array provided. Your JSON may have been truncated. Try writing fewer files per call, or use write_file for individual files.', isError: true };
    }

    let written = 0;
    const skipped: string[] = [];
    const corrupted: string[] = [];

    for (const f of args.files) {
      if (!f.path || !f.content) {
        skipped.push(f.path || 'unknown');
        continue;
      }
      f.content = sanitizeFileContent(f.content, f.path);
      // Detect corrupted content (long single-line files are almost certainly broken)
      // Exempt XML/HTML content (e.g. SVG icons are often single-line)
      if (f.content.length > 100 && !f.content.includes('\n') && !f.content.trimStart().startsWith('<')) {
        corrupted.push(f.path);
        continue;
      }
      await ctx.fs.writeFile(f.path, f.content);
      ctx.callbacks.onFileWritten?.(f.path, f.content);
      written++;
    }

    ctx.hasWrittenFiles = true;
    const rewrittenPaths: string[] = [];
    for (const f of args.files) {
      if (f.path && f.content) {
        if (ctx.writtenFilesSet.has(f.path)) rewrittenPaths.push(f.path);
        if (!ctx.modifiedFiles.includes(f.path)) ctx.modifiedFiles.push(f.path);
        ctx.writtenFilesSet.add(f.path);
      }
    }

    let content: string;
    if (corrupted.length > 0) {
      content = `${written} of ${args.files.length} files written. ${corrupted.length} files had corrupted content (no newlines detected, likely a serialization error) and were NOT written: ${corrupted.join(', ')}. Please re-write these files individually using write_file.`;
    } else if (skipped.length > 0) {
      content = `${written} of ${args.files.length} files written. Skipped ${skipped.length} files with missing path or content (possible truncation): ${skipped.join(', ')}`;
    } else {
      content = `${written} of ${args.files.length} files written successfully.`;
    }

    if (rewrittenPaths.length > 0) {
      content += `\n⚠ EFFICIENCY: ${rewrittenPaths.length} file(s) were rewritten that you already created earlier: ${rewrittenPaths.join(', ')}. Use edit_file for targeted changes instead of rewriting entire files.`;
    }

    return { content, isError: corrupted.length > 0 && written === 0 };
  },

  getActivityDescription(args) {
    const count = Array.isArray(args.files) ? args.files.length : '?';
    return `Writing ${count} files`;
  },
};
