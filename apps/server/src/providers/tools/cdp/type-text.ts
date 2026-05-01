import { Tool } from '../types';
import { getCdpAgentUrl, isDesktopMode } from '../utils';

export const typeText: Tool = {
  definition: {
    name: 'type_text',
    description: 'Type text into the currently focused element in the preview. Use after browse_click to focus an input field, then type_text to enter content. Supports special keys like Enter, Tab, Escape, Backspace.',
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to type. For special keys use: {Enter}, {Tab}, {Escape}, {Backspace}, {ArrowUp}, {ArrowDown}, {ArrowLeft}, {ArrowRight}.'
        }
      },
      required: ['text']
    },
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'type_text is only available in desktop mode.', isError: true };
    }

    try {
      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: args.text || '' }),
      });
      const data = await resp.json();
      return { content: JSON.stringify(data, null, 2), isError: !resp.ok };
    } catch (err: any) {
      return { content: `type_text failed: ${err.message}`, isError: true };
    }
  }
};
