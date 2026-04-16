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
    if (items.length === 0) {
      // Distinguish between "empty" and "not found" — try parent to suggest alternatives
      if (args.path !== '.' && args.path !== './') {
        const parentPath = args.path.replace(/\/[^/]+\/?$/, '') || '.';
        try {
          const siblings = await ctx.fs.listDir(parentPath);
          const dirs = siblings.filter((s: string) => s.endsWith('/'));
          const target = args.path.split('/').pop()?.replace(/\/$/, '') || '';
          const similar = dirs.filter((d: string) => {
            const name = d.replace(/\/$/, '').toLowerCase();
            return name.includes(target.toLowerCase()) || target.toLowerCase().includes(name);
          });
          if (similar.length > 0) {
            return {
              content: `Directory not found or empty: "${args.path}". Did you mean one of these?\n${similar.map((s: string) => `  ${parentPath}/${s}`).join('\n')}`,
              isError: true,
            };
          }
        } catch { /* parent also not found, fall through */ }
      }
      return { content: `Directory is empty or not found: "${args.path}"`, isError: false };
    }
    return { content: items.join('\n'), isError: false };
  },

  getActivityDescription(args) {
    return `Listing ${args.path || '.'}`;
  },
};
