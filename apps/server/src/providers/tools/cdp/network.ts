import { Tool } from '../types';
import { getCdpAgentUrl, isDesktopMode } from '../utils';

export const inspectNetwork: Tool = {
  definition: {
    name: 'inspect_network',
    description: 'Get recent network requests from the preview. Returns requests with URL, method, status, duration, and response size. Use action "start" to begin capturing, "get" to retrieve captured requests, "clear" to reset.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'get', 'clear'],
          description: 'Action to perform: "start" enables network monitoring, "get" returns captured requests, "clear" resets the buffer.'
        }
      },
      required: ['action']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'inspect_network is only available in desktop mode.', isError: true };
    }

    try {
      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: args.action || 'get' }),
      });
      const data = await resp.json();
      return { content: JSON.stringify(data, null, 2), isError: !resp.ok };
    } catch (err: any) {
      return { content: `inspect_network failed: ${err.message}`, isError: true };
    }
  }
};
