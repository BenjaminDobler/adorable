import { Tool } from '../types';
import { contentHash, normalizeQuotes } from '../utils';
import { discoverRelevantDocs } from './skill-discovery';
import * as fs from 'fs/promises';
import * as path from 'path';

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
    // --- Read prerequisite check ---
    if (!ctx.readFileState.has(args.path)) {
      return {
        content: `Error: You must read "${args.path}" first before editing it. Call read_file or read_files first.`,
        isError: true,
      };
    }

    // --- Staleness check ---
    const snapshot = ctx.readFileState.get(args.path)!;
    try {
      const fullPath = path.resolve((ctx.fs as any).projectPath || '.', args.path);
      const stat = await fs.stat(fullPath);
      if (stat.mtimeMs > snapshot.mtime) {
        const currentContent = await ctx.fs.readFile(args.path);
        const currentHash = contentHash(currentContent);
        if (currentHash !== snapshot.contentHash) {
          return {
            content: `Error: "${args.path}" has been modified since you last read it. Re-read the file before editing.`,
            isError: true,
          };
        }
      }
    } catch { /* non-disk FS, skip staleness check */ }

    // --- Partial read warning ---
    if (snapshot.partial) {
      // Don't block, just warn
    }

    // --- Save history for undo ---
    try {
      const previousContent = await ctx.fs.readFile(args.path);
      ctx.fileHistory.set(args.path, { content: previousContent, timestamp: Date.now() });
    } catch { /* file might not exist yet */ }

    // --- Apply edit (with quote normalization fallback) ---
    try {
      await ctx.fs.editFile(args.path, args.old_str, args.new_str);
    } catch (e: any) {
      // If exact match fails, try with normalized quotes
      if (e.message.includes('old_str not found')) {
        const normalized = normalizeQuotes(args.old_str);
        if (normalized !== args.old_str) {
          try {
            const content = await ctx.fs.readFile(args.path);
            // Find the curly-quote version in the file
            const normalizedContent = normalizeQuotes(content);
            const idx = normalizedContent.indexOf(normalized);
            if (idx >= 0) {
              const actualOldStr = content.substring(idx, idx + normalized.length);
              await ctx.fs.editFile(args.path, actualOldStr, args.new_str);
              // Fall through to success
            } else {
              throw e; // re-throw original error
            }
          } catch (e2: any) {
            if (e2 === e) throw e;
            throw e2;
          }
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    const updatedContent = await ctx.fs.readFile(args.path);
    ctx.callbacks.onFileWritten?.(args.path, updatedContent);
    if (!ctx.modifiedFiles.includes(args.path)) ctx.modifiedFiles.push(args.path);

    // Update read state after edit
    try {
      const fullPath = path.resolve((ctx.fs as any).projectPath || '.', args.path);
      const stat = await fs.stat(fullPath);
      ctx.readFileState.set(args.path, {
        mtime: stat.mtimeMs,
        contentHash: contentHash(updatedContent),
        partial: false,
      });
    } catch { /* skip */ }

    // --- Structured diff output ---
    const oldLines = args.old_str.split('\n').length;
    const newLines = args.new_str.split('\n').length;
    const lineDelta = newLines - oldLines;
    const deltaStr = lineDelta === 0 ? 'same line count' : lineDelta > 0 ? `+${lineDelta} lines` : `${lineDelta} lines`;

    // Skill discovery — suggest relevant kit docs
    const docHint = await discoverRelevantDocs(args.path, updatedContent, ctx);

    return {
      content: `File edited successfully. (${oldLines} → ${newLines} lines, ${deltaStr})${docHint}`,
      isError: false,
    };
  },

  getActivityDescription(args) {
    return `Editing ${args.path || 'file'}`;
  },
};
