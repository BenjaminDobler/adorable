import { Tool } from '../types';
import { tryParseJsonArray } from '../utils';

export const patchFiles: Tool = {
  definition: {
    name: 'patch_files',
    description: 'Apply targeted edits to MULTIPLE files at once. Much more efficient than write_files for modifications — sends only the changed parts instead of entire file contents. Each patch specifies a file path and one or more search/replace pairs. PREREQUISITE: You MUST have read each file first.',
    input_schema: {
      type: 'object',
      properties: {
        patches: {
          type: 'array',
          description: 'Array of file patches to apply.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'The path to the file to patch.' },
              changes: {
                type: 'array',
                description: 'Array of search/replace pairs to apply in order.',
                items: {
                  type: 'object',
                  properties: {
                    old_str: { type: 'string', description: 'The exact string to find (must be unique in the file).' },
                    new_str: { type: 'string', description: 'The string to replace it with.' }
                  },
                  required: ['old_str', 'new_str']
                }
              }
            },
            required: ['path', 'changes']
          }
        }
      },
      required: ['patches']
    },
  },

  async execute(args, ctx) {
    const parsed = tryParseJsonArray(args.patches);
    if (parsed) args.patches = parsed;

    if (!args.patches || !Array.isArray(args.patches)) {
      return { content: 'Error: No patches array provided.', isError: true };
    }

    const patchResults: string[] = [];
    let patchedCount = 0;
    let errorCount = 0;

    for (const patch of args.patches) {
      if (!patch.path || !Array.isArray(patch.changes) || patch.changes.length === 0) {
        patchResults.push(`${patch.path || '?'}: skipped (missing path or changes)`);
        continue;
      }

      const changeResults: string[] = [];
      let fileErrored = false;

      for (let i = 0; i < patch.changes.length; i++) {
        const change = patch.changes[i];
        if (!change.old_str || change.new_str === undefined) {
          changeResults.push(`  change ${i + 1}: skipped (missing old_str or new_str)`);
          continue;
        }
        try {
          await ctx.fs.editFile(patch.path, change.old_str, change.new_str);
        } catch (err: any) {
          changeResults.push(`  change ${i + 1}: FAILED — ${err.message}`);
          fileErrored = true;
          errorCount++;
          break; // Stop — file state is uncertain
        }
      }

      if (!fileErrored) {
        const updatedContent = await ctx.fs.readFile(patch.path);
        ctx.callbacks.onFileWritten?.(patch.path, updatedContent);
        if (!ctx.modifiedFiles.includes(patch.path)) ctx.modifiedFiles.push(patch.path);
        patchedCount++;
        if (changeResults.length > 0) {
          patchResults.push(`${patch.path}: ${patch.changes.length - changeResults.length}/${patch.changes.length} changes applied\n${changeResults.join('\n')}`);
        }
      } else {
        try {
          const currentContent = await ctx.fs.readFile(patch.path);
          ctx.callbacks.onFileWritten?.(patch.path, currentContent);
        } catch { /* file may not exist */ }
        patchResults.push(`${patch.path}: FAILED\n${changeResults.join('\n')}`);
      }
    }

    let content: string;
    if (errorCount === 0) {
      content = `${patchedCount} file(s) patched successfully.`;
      if (patchResults.length > 0) content += '\n' + patchResults.join('\n');
    } else {
      content = `${patchedCount} file(s) patched, ${errorCount} error(s):\n${patchResults.join('\n')}`;
    }

    return { content, isError: errorCount > 0 && patchedCount === 0 };
  },

  getActivityDescription(args) {
    const count = Array.isArray(args.patches) ? args.patches.length : '?';
    return `Patching ${count} files`;
  },
};
