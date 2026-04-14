import { Tool } from '../types';
import { getCdpAgentUrl } from '../utils';

export const clearBuildCache: Tool = {
  definition: {
    name: 'clear_build_cache',
    description: 'Clear Angular and Nx build caches (.angular/cache, .nx/cache, node_modules/.cache). Use when encountering phantom build errors that persist despite correct code.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
  },

  async execute(args, ctx) {
    try {
      const resp = await fetch(`${getCdpAgentUrl()}/api/native/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'rm -rf .angular/cache .nx/cache node_modules/.cache 2>/dev/null; echo "Build caches cleared"' }),
      });
      const data = await resp.json();
      return { content: data.stdout || data.output || 'Build caches cleared', isError: false };
    } catch (err: any) {
      return { content: `clear_build_cache failed: ${err.message}`, isError: true };
    }
  }
};

export const getContainerLogs: Tool = {
  definition: {
    name: 'get_container_logs',
    description: 'Get recent dev server logs from the container/native process. Returns the last N lines of build output, HMR status, and server messages. Useful for debugging dev server crashes or configuration issues.',
    input_schema: {
      type: 'object',
      properties: {
        lines: {
          type: 'number',
          description: 'Number of recent log lines to return. Default 50.'
        }
      },
      required: []
    },
  },

  async execute(args, ctx) {
    const lines = args.lines || 50;
    try {
      const resp = await fetch(`${getCdpAgentUrl()}/api/native/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `tail -n ${lines} /tmp/adorable-dev-server.log 2>/dev/null || echo "No dev server log found. Try checking the terminal output."` }),
      });
      const data = await resp.json();
      return { content: data.stdout || data.output || 'No logs available', isError: false };
    } catch (err: any) {
      return { content: `get_container_logs failed: ${err.message}`, isError: true };
    }
  }
};
