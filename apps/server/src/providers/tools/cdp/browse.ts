import { Tool } from '../types';
import { getCdpAgentUrl, isDesktopMode } from '../utils';

export const browseScreenshot: Tool = {
  definition: {
    name: 'browse_screenshot',
    description: 'Capture a screenshot of the running application preview via Chrome DevTools Protocol. Returns a base64 JPEG image. By default, screenshots are resized to max 1280x800 to save tokens. For high-fidelity comparisons (e.g. Figma designs), set fullResolution to true.',
    input_schema: {
      type: 'object',
      properties: {
        fullResolution: {
          type: 'boolean',
          description: 'If true, return the screenshot at native display resolution without resizing. Use for pixel-perfect comparisons with design mockups. Default false.'
        },
        quality: {
          type: 'number',
          description: 'JPEG quality (1-100). Higher = better quality but larger image. Default 80.'
        }
      },
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'CDP browser tools are only available in desktop mode with the preview running.', isError: true };
    }

    try {
      const body: Record<string, any> = {};
      if (args.fullResolution) body.fullResolution = true;
      if (args.quality) body.quality = args.quality;

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `CDP screenshot failed: ${data.error}`, isError: true };
      }
      return { content: `[SCREENSHOT:data:image/jpeg;base64,${data.image}]`, isError: false };
    } catch (err: any) {
      return { content: `CDP request failed: ${err.message}`, isError: true };
    }
  }
};

export const browseEvaluate: Tool = {
  definition: {
    name: 'browse_evaluate',
    description: 'Execute JavaScript in the application preview via Chrome DevTools Protocol. Use to inspect DOM state, read computed styles, check variable values, debug runtime issues, or query the page. The expression is evaluated in the page context.',
    input_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'JavaScript expression to evaluate in the preview page context. Can use await for async operations.'
        }
      },
      required: ['expression']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'CDP browser tools are only available in desktop mode with the preview running.', isError: true };
    }

    try {
      const body: Record<string, any> = { expression: args.expression };

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `CDP evaluate failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `CDP request failed: ${err.message}`, isError: true };
    }
  }
};

export const browseAccessibility: Tool = {
  definition: {
    name: 'browse_accessibility',
    description: 'Get the accessibility tree of the preview page. Returns a structured view of all accessible elements with their roles, names, and descriptions. Useful for checking ARIA compliance, understanding page structure, and verifying semantic HTML.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'CDP browser tools are only available in desktop mode with the preview running.', isError: true };
    }

    try {
      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/accessibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `CDP accessibility failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `CDP request failed: ${err.message}`, isError: true };
    }
  }
};

export const browseConsole: Tool = {
  definition: {
    name: 'browse_console',
    description: 'Read buffered console messages (log, warn, error) from the preview. Returns messages since last read. Use this to check for runtime errors, warnings, or debug output.',
    input_schema: {
      type: 'object',
      properties: {
        clear: {
          type: 'boolean',
          description: 'Clear the buffer after reading. Defaults to true.'
        }
      },
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'CDP browser tools are only available in desktop mode with the preview running.', isError: true };
    }

    try {
      const body: Record<string, any> = { clear: args.clear ?? true };

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/console`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `CDP console failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `CDP request failed: ${err.message}`, isError: true };
    }
  }
};

export const browseNavigate: Tool = {
  definition: {
    name: 'browse_navigate',
    description: 'Navigate the preview to a specific URL or route path. Use to test different routes/pages in the application.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to. Can be a full URL or a path relative to the dev server.'
        }
      },
      required: ['url']
    },
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'CDP browser tools are only available in desktop mode with the preview running.', isError: true };
    }

    try {
      const body: Record<string, any> = { url: args.url };

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `CDP navigate failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `CDP request failed: ${err.message}`, isError: true };
    }
  }
};

export const browseClick: Tool = {
  definition: {
    name: 'browse_click',
    description: 'Click at specific coordinates in the preview page. Use after taking a screenshot to interact with visible elements.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels from the left edge.' },
        y: { type: 'number', description: 'Y coordinate in pixels from the top edge.' }
      },
      required: ['x', 'y']
    },
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'CDP browser tools are only available in desktop mode with the preview running.', isError: true };
    }

    try {
      const body: Record<string, any> = { x: args.x, y: args.y };

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `CDP click failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `CDP request failed: ${err.message}`, isError: true };
    }
  }
};
