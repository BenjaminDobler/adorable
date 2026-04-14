import { Tool } from '../types';
import { figmaBridge } from '../../../services/figma-bridge.service';

/**
 * JSON replacer that strips empty arrays, default visual values, invisible
 * fills/strokes, and empty boundVariables to reduce token usage.
 */
function slimReplacer(key: string, val: any): any {
  // Strip empty arrays (fills: [], strokes: [], effects: [])
  if (Array.isArray(val) && val.length === 0) return undefined;
  // Strip default visual values
  if (key === 'visible' && val === true) return undefined;
  if (key === 'opacity' && val === 1) return undefined;
  if (key === 'cornerRadius' && val === 0) return undefined;
  // Strip invisible fills/strokes (visible: false)
  if ((key === 'fills' || key === 'strokes') && Array.isArray(val)) {
    const visible = val.filter((f: any) => f.visible !== false);
    return visible.length > 0 ? visible : undefined;
  }
  // Strip boundVariables if empty
  if (key === 'boundVariables' && typeof val === 'object' && Object.keys(val).length === 0) return undefined;
  return val;
}

function checkConnection(userId: string): string | null {
  if (!figmaBridge.isConnected(userId)) {
    return 'Figma is not connected. The user needs to open the Adorable plugin in Figma Desktop and connect via the Live Bridge.';
  }
  return null;
}

export const figmaGetSelection: Tool = {
  definition: {
    name: 'figma_get_selection',
    description: 'Get the current selection in the connected Figma file. Returns the node structure (names, types, bounding boxes, visual properties) as JSON — NO images. Use figma_export_node separately to get a visual reference. For large selections, use figma_get_node with depth parameter to fetch sections incrementally.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const userId = ctx.userId || '';
    const error = checkConnection(userId);
    if (error) return { content: error, isError: true };

    try {
      const result = await figmaBridge.sendCommand(userId, { action: 'get_selection' });
      const slimResult = JSON.stringify(result, slimReplacer, 2);
      return { content: slimResult, isError: false };
    } catch (err: any) {
      return { content: `Figma bridge request failed: ${err.message}`, isError: true };
    }
  }
};

export const figmaGetNode: Tool = {
  definition: {
    name: 'figma_get_node',
    description: 'Get the structure of a specific Figma node by its ID. Returns the node tree with visual properties (fills, strokes, effects, dimensions). Optionally includes a PNG export.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'The Figma node ID (e.g., "1:23").'
        },
        includeImage: {
          type: 'boolean',
          description: 'Also export the node as a PNG image. Default true.'
        }
      },
      required: ['nodeId']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const userId = ctx.userId || '';
    const error = checkConnection(userId);
    if (error) return { content: error, isError: true };

    try {
      const result = await figmaBridge.sendCommand(userId, {
        action: 'get_node',
        nodeId: args.nodeId,
        depth: args.depth
      });
      const slimResult = JSON.stringify(result, slimReplacer, 2);
      return { content: slimResult, isError: false };
    } catch (err: any) {
      return { content: `Figma bridge request failed: ${err.message}`, isError: true };
    }
  }
};

export const figmaExportNode: Tool = {
  definition: {
    name: 'figma_export_node',
    description: 'Export a Figma node as PNG or SVG. Use PNG for visual comparison. Use SVG (format: "SVG") for logos, illustrations, and vector graphics that should be inlined in code — this produces clean, scalable markup instead of a raster image.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'The Figma node ID to export.'
        },
        format: {
          type: 'string',
          enum: ['PNG', 'SVG'],
          description: 'Export format. Use "SVG" for logos and vector assets to inline in code. Default "PNG".'
        },
        scale: {
          type: 'number',
          description: 'Export scale for PNG (1-4). Default 2. Ignored for SVG.'
        }
      },
      required: ['nodeId']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const userId = ctx.userId || '';
    const error = checkConnection(userId);
    if (error) return { content: error, isError: true };

    try {
      const result = await figmaBridge.sendCommand(userId, {
        action: 'export_node',
        nodeId: args.nodeId,
        scale: args.scale || 1,
        format: args.format || 'PNG'
      });

      if (result.svg) {
        return { content: result.svg, isError: false };
      } else if (result.image) {
        return { content: `[SCREENSHOT:${result.image}]`, isError: false };
      }
      return { content: JSON.stringify(result, null, 2), isError: false };
    } catch (err: any) {
      return { content: `Figma bridge request failed: ${err.message}`, isError: true };
    }
  }
};

export const figmaSelectNode: Tool = {
  definition: {
    name: 'figma_select_node',
    description: 'Select a node in Figma and scroll/zoom it into view. Use to highlight matching elements or show the user which design element you are implementing.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'The Figma node ID to select.'
        }
      },
      required: ['nodeId']
    },
    isReadOnly: false,
  },

  async execute(args, ctx) {
    const userId = ctx.userId || '';
    const error = checkConnection(userId);
    if (error) return { content: error, isError: true };

    try {
      const result = await figmaBridge.sendCommand(userId, {
        action: 'select_node',
        nodeId: args.nodeId
      });
      return { content: JSON.stringify(result, null, 2), isError: false };
    } catch (err: any) {
      return { content: `Figma bridge request failed: ${err.message}`, isError: true };
    }
  }
};

export const figmaSearchNodes: Tool = {
  definition: {
    name: 'figma_search_nodes',
    description: 'Search for nodes in the current Figma page by name. Returns matching node IDs, names, types, and dimensions (up to 50 results). Use to find specific design elements.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to match against node names (case-insensitive partial match).'
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional filter by node types (e.g., ["FRAME", "COMPONENT", "TEXT"]).'
        }
      },
      required: ['query']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const userId = ctx.userId || '';
    const error = checkConnection(userId);
    if (error) return { content: error, isError: true };

    try {
      const result = await figmaBridge.sendCommand(userId, {
        action: 'search_nodes',
        query: args.query,
        types: args.types
      });
      return { content: JSON.stringify(result, null, 2), isError: false };
    } catch (err: any) {
      return { content: `Figma bridge request failed: ${err.message}`, isError: true };
    }
  }
};

export const figmaGetFonts: Tool = {
  definition: {
    name: 'figma_get_fonts',
    description: 'Get all fonts used in the current Figma page. Returns font families, styles/weights, whether each is an icon font, Unicode codepoint samples for icon fonts, CDN URLs, and — critically — the correct CSS font-family name and font-weight to use in code (which often differs from Figma\'s internal name). ALWAYS call this before generating code from a Figma design.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const userId = ctx.userId || '';
    const error = checkConnection(userId);
    if (error) return { content: error, isError: true };

    try {
      const result = await figmaBridge.sendCommand(userId, { action: 'get_fonts' });
      return { content: JSON.stringify(result, null, 2), isError: false };
    } catch (err: any) {
      return { content: `Figma bridge request failed: ${err.message}`, isError: true };
    }
  }
};

export const figmaGetVariables: Tool = {
  definition: {
    name: 'figma_get_variables',
    description: 'Extract design tokens (Figma local variables) from the connected file. Returns collections, modes, and tokens with resolved values per mode. Colors are resolved to #hex/rgba(), variable aliases are followed. Use to get exact design token values for theme files.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    const userId = ctx.userId || '';
    const error = checkConnection(userId);
    if (error) return { content: error, isError: true };

    try {
      const result = await figmaBridge.sendCommand(userId, { action: 'get_variables' });
      return { content: JSON.stringify(result, null, 2), isError: false };
    } catch (err: any) {
      return { content: `Figma bridge request failed: ${err.message}`, isError: true };
    }
  }
};
