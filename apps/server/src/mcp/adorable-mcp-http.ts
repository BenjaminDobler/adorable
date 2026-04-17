/**
 * Adorable MCP HTTP Server
 *
 * Mounts MCP endpoints on the Adorable Express server so Claude Code
 * can connect via URL (no spawning needed).
 *
 * Uses SSE transport: GET /mcp → SSE stream, POST /mcp/message → JSON-RPC messages.
 *
 * Tools have direct in-process access to figmaBridge, CDP agent, skills, etc.
 */
import { Router } from 'express';
import * as crypto from 'crypto';
import { figmaBridge } from '../services/figma-bridge.service';

const router = Router();

// ── Figma command serializer — the plugin can't handle parallel requests ──

let figmaQueue: Promise<unknown> = Promise.resolve();

function serialFigmaCall<T>(fn: () => Promise<T>): Promise<T> {
  const next = figmaQueue.then(fn, fn); // always chain, even after errors
  figmaQueue = next.catch(() => {}); // swallow to keep chain alive
  return next;
}

// ── Figma JSON slimmer — strips empty/default values to reduce token usage ──

function slimReplacer(key: string, val: unknown): unknown {
  // Strip empty arrays
  if (Array.isArray(val) && val.length === 0) return undefined;
  // Strip default visual values
  if (key === 'visible' && val === true) return undefined;
  if (key === 'opacity' && val === 1) return undefined;
  if (key === 'cornerRadius' && val === 0) return undefined;
  if (key === 'blendMode' && val === 'NORMAL') return undefined;
  if (key === 'blendMode' && val === 'PASS_THROUGH') return undefined;
  // Strip fills/strokes that are invisible
  if ((key === 'fills' || key === 'strokes') && Array.isArray(val)) {
    const visible = val.filter((f: Record<string, unknown>) => f.visible !== false);
    return visible.length > 0 ? visible : undefined;
  }
  // Strip empty objects
  if (key === 'boundVariables' && typeof val === 'object' && val !== null && Object.keys(val).length === 0) return undefined;
  // Strip verbose unit objects — convert {value: N, unit: "PIXELS"} to just N
  if ((key === 'letterSpacing' || key === 'lineHeight') && typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    if (obj.unit === 'PIXELS' && typeof obj.value === 'number') return obj.value;
    if (obj.unit === 'PERCENT' && typeof obj.value === 'number') return `${obj.value}%`;
    if (obj.unit === 'AUTO') return 'auto';
  }
  // Convert color objects {r, g, b, a} to hex strings inline
  if (key === 'color' && typeof val === 'object' && val !== null) {
    const c = val as Record<string, number>;
    if (typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
      const hex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
      const a = c.a != null ? c.a : 1;
      if (a < 1) return `rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${a.toFixed(2)})`;
      return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
    }
  }
  return val;
}

// Claude Code has a built-in tool result size limit (~100K characters / ~25K tokens).
// Results exceeding this get saved to a file, forcing an Agent subagent to read
// it in chunks (35+ tool calls, very slow). Keep responses under this limit.
const MAX_FIGMA_RESPONSE_CHARS = 90_000; // ~90K chars — safely under Claude Code's limit

/**
 * Truncate a Figma result to stay under Claude Code's tool result limit.
 * Progressively reduces tree depth until it fits.
 */
function truncateFigmaResult(result: unknown, maxChars = MAX_FIGMA_RESPONSE_CHARS): string {
  const json = JSON.stringify(result, slimReplacer);
  if (json.length <= maxChars) return json;

  // Too large — progressively reduce depth
  for (const depth of [10, 8, 6, 5, 4]) {
    const pruned = pruneDepth(result, depth);
    const prunedJson = JSON.stringify(pruned, slimReplacer);
    if (prunedJson.length <= maxChars) return prunedJson;
  }

  // Last resort — hard truncate
  return json.substring(0, maxChars) + '...[TRUNCATED — selection too complex, try selecting a smaller element or use figma_get_node on child IDs]';
}

function pruneDepth(obj: unknown, maxDepth: number, depth = 0): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    if (depth >= maxDepth) return obj.length > 0 ? [`...(${obj.length} items)`] : [];
    return obj.map(item => pruneDepth(item, maxDepth, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (key === 'children' && depth >= maxDepth) {
      const arr = Array.isArray(val) ? val : [];
      result[key] = arr.length > 0 ? [`...(${arr.length} children, depth limited)`] : [];
    } else {
      result[key] = pruneDepth(val, maxDepth, depth + 1);
    }
  }
  return result;
}

// ── Configuration ────────────────────────────────────────────────────

const AGENT_PORT = () => process.env['ADORABLE_AGENT_PORT'] || '3334';
const CDP_BASE = () => `http://localhost:${AGENT_PORT()}/api/native/cdp`;

// ── Tool Definitions ─────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, userId?: string) => Promise<ToolResult>;
}

interface ToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

function imageResult(base64: string, mimeType = 'image/jpeg'): ToolResult {
  return { content: [{ type: 'image', data: base64, mimeType }] };
}

// ── CDP Helpers ──────────────────────────────────────────────────────

async function cdpCall(endpoint: string, body: Record<string, unknown> = {}): Promise<string> {
  const res = await fetch(`${CDP_BASE()}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CDP ${endpoint}: ${res.status} ${await res.text()}`);
  return res.text();
}

async function cdpJson(endpoint: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${CDP_BASE()}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CDP ${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Tool Definitions ─────────────────────────────────────────────────

const tools: ToolDef[] = [
  // ── CDP Browser Tools ────────────────────────────────────────────
  {
    name: 'browse_screenshot',
    description: 'Take a screenshot of the live preview. Returns the image for visual verification.',
    inputSchema: {
      type: 'object',
      properties: {
        fullResolution: { type: 'boolean', description: 'Native resolution for pixel-perfect comparison. Default false.' },
        quality: { type: 'number', description: 'JPEG quality 1-100. Default 80.' },
      },
    },
    async handler(args) {
      const raw = await cdpCall('screenshot', args);
      try {
        const data = JSON.parse(raw);
        if (data.image) {
          const base64 = data.image.replace(/^data:image\/\w+;base64,/, '');
          return imageResult(base64);
        }
      } catch { /* not JSON */ }
      return textResult(raw);
    },
  },
  {
    name: 'browse_evaluate',
    description: 'Evaluate JavaScript in the live preview page context.',
    inputSchema: { type: 'object', properties: { expression: { type: 'string', description: 'JS expression. Can use await.' } }, required: ['expression'] },
    async handler(args) { return textResult(JSON.stringify(await cdpJson('evaluate', args), null, 2)); },
  },
  {
    name: 'browse_accessibility',
    description: 'Get accessibility tree of the live preview.',
    inputSchema: { type: 'object', properties: {} },
    async handler() { return textResult(JSON.stringify(await cdpJson('accessibility'), null, 2)); },
  },
  {
    name: 'browse_console',
    description: 'Read console messages (errors, warnings, logs) from the live preview.',
    inputSchema: { type: 'object', properties: { clear: { type: 'boolean', description: 'Clear after reading. Default true.' } } },
    async handler(args) { return textResult(JSON.stringify(await cdpJson('console', args), null, 2)); },
  },
  {
    name: 'browse_navigate',
    description: 'Navigate the live preview to a URL or route path.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'URL or path.' } }, required: ['url'] },
    async handler(args) { return textResult(JSON.stringify(await cdpJson('navigate', args), null, 2)); },
  },
  {
    name: 'browse_click',
    description: 'Click at coordinates in the live preview.',
    inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
    async handler(args) { return textResult(JSON.stringify(await cdpJson('click', args), null, 2)); },
  },
  {
    name: 'type_text',
    description: 'Type text into focused element. Use {Enter}, {Tab}, {Escape} for special keys.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    async handler(args) { return textResult(JSON.stringify(await cdpJson('type', args), null, 2)); },
  },
  {
    name: 'inspect_component',
    description: 'Inspect Angular components with ONG annotations, bindings, and source locations.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string', description: 'CSS selector or _ong ID. Omit for full tree.' } } },
    async handler(args) {
      const expr = args.selector
        ? `window.__ong?.getComponentInfo?.('${args.selector}') || document.querySelector('${args.selector}')?.outerHTML?.substring(0, 500)`
        : `window.__ong?.getComponentTree?.() || 'ONG annotations not available'`;
      return textResult(JSON.stringify(await cdpJson('evaluate', { expression: expr }), null, 2));
    },
  },
  {
    name: 'inspect_routes',
    description: 'List all registered Angular routes.',
    inputSchema: { type: 'object', properties: {} },
    async handler() { return textResult(JSON.stringify(await cdpJson('evaluate', { expression: `window.__ong?.getRoutes?.() || 'Not available'` }), null, 2)); },
  },
  {
    name: 'inspect_signals',
    description: 'Inspect Angular signals state.',
    inputSchema: { type: 'object', properties: {} },
    async handler() { return textResult(JSON.stringify(await cdpJson('evaluate', { expression: `window.__ong?.getSignals?.() || 'Not available'` }), null, 2)); },
  },
  {
    name: 'inspect_errors',
    description: 'Get runtime errors from the live preview.',
    inputSchema: { type: 'object', properties: {} },
    async handler() { return textResult(JSON.stringify(await cdpJson('evaluate', { expression: `window.__ong?.getErrors?.() || 'Not available'` }), null, 2)); },
  },
  {
    name: 'inspect_styles',
    description: 'Get computed styles for an element.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] },
    async handler(args) {
      return textResult(JSON.stringify(await cdpJson('evaluate', {
        expression: `(() => { const el = document.querySelector('${args.selector}'); if (!el) return 'Not found'; const s = getComputedStyle(el); return JSON.stringify({display:s.display,position:s.position,width:s.width,height:s.height,margin:s.margin,padding:s.padding,color:s.color,background:s.background,fontSize:s.fontSize,fontFamily:s.fontFamily,fontWeight:s.fontWeight,border:s.border,borderRadius:s.borderRadius,flexDirection:s.flexDirection,justifyContent:s.justifyContent,alignItems:s.alignItems,gap:s.gap}); })()`,
      }), null, 2));
    },
  },
  {
    name: 'inspect_dom',
    description: 'Get DOM structure for an element.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string' }, depth: { type: 'number', description: 'Max depth. Default 3.' } }, required: ['selector'] },
    async handler(args) {
      const d = args.depth ?? 3;
      return textResult(JSON.stringify(await cdpJson('evaluate', {
        expression: `(() => { const el = document.querySelector('${args.selector}'); if (!el) return 'Not found'; function w(n,d){if(d===0)return{tag:n.tagName?.toLowerCase(),children:'...'};const o={tag:n.tagName?.toLowerCase(),id:n.id||undefined,class:n.className||undefined};if(n.children.length>0&&d!==0)o.children=Array.from(n.children).map(c=>w(c,d-1));return o;} return JSON.stringify(w(el,${d})); })()`,
      }), null, 2));
    },
  },
  {
    name: 'measure_element',
    description: 'Measure element bounding box and styles.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] },
    async handler(args) {
      return textResult(JSON.stringify(await cdpJson('evaluate', {
        expression: `(() => { const el = document.querySelector('${args.selector}'); if (!el) return 'Not found'; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return JSON.stringify({x:r.x,y:r.y,width:r.width,height:r.height,margin:s.margin,padding:s.padding,fontSize:s.fontSize,lineHeight:s.lineHeight}); })()`,
      }), null, 2));
    },
  },
  {
    name: 'inject_css',
    description: 'Inject or clear CSS in the live preview.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['add', 'clear'] }, css: { type: 'string' } }, required: ['action'] },
    async handler(args) {
      const expr = args.action === 'clear'
        ? `document.getElementById('adorable-injected-css')?.remove(); 'Cleared'`
        : `(() => { let s = document.getElementById('adorable-injected-css'); if (!s) { s = document.createElement('style'); s.id = 'adorable-injected-css'; document.head.appendChild(s); } s.textContent += '${String(args.css || '').replace(/'/g, "\\'")}'; return 'Injected'; })()`;
      return textResult(JSON.stringify(await cdpJson('evaluate', { expression: expr }), null, 2));
    },
  },
  {
    name: 'get_bundle_stats',
    description: 'Get JS bundle statistics from the live preview.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      return textResult(JSON.stringify(await cdpJson('evaluate', {
        expression: `(() => { const scripts = Array.from(document.querySelectorAll('script[src]')); return JSON.stringify(scripts.map(s => ({src:s.src,async:s.async,defer:s.defer}))); })()`,
      }), null, 2));
    },
  },
  {
    name: 'inspect_network',
    description: 'Monitor network requests. "start" to begin, "get" to read, "clear" to reset.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'get', 'clear'] } }, required: ['action'] },
    async handler(args) { return textResult(JSON.stringify(await cdpJson('network', args), null, 2)); },
  },
  {
    name: 'clear_build_cache',
    description: 'Clear Angular build cache.',
    inputSchema: { type: 'object', properties: {} },
    async handler() { return textResult(JSON.stringify(await cdpJson('system', { action: 'clear-cache' }), null, 2)); },
  },
  {
    name: 'get_container_logs',
    description: 'Get recent dev server logs.',
    inputSchema: { type: 'object', properties: { lines: { type: 'number', description: 'Number of lines. Default 50.' } } },
    async handler(args) { return textResult(JSON.stringify(await cdpJson('system', { action: 'logs', lines: args.lines || 50 }), null, 2)); },
  },

  // ── Figma Tools ──────────────────────────────────────────────────
  {
    name: 'figma_get_selection',
    description: 'Get currently selected Figma nodes with styles, layout, and text content.',
    inputSchema: { type: 'object', properties: {} },
    async handler(_args, userId) {
      if (!userId || !figmaBridge.isConnected(userId)) return textResult('Figma not connected', true);
      return serialFigmaCall(async () => {
        try {
          const result = await figmaBridge.sendCommand(userId, { action: 'get_selection' });
          const truncated = truncateFigmaResult(result);
          console.log(`[MCP] figma_get_selection response: ${Math.round(truncated.length / 1024)}KB`);
          return textResult(truncated);
        } catch (err: unknown) {
          return textResult(`Figma error: ${err instanceof Error ? err.message : String(err)}`, true);
        }
      });
    },
  },
  {
    name: 'figma_get_node',
    description: 'Get detailed info about a Figma node by ID.',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, includeImage: { type: 'boolean' } }, required: ['nodeId'] },
    async handler(args, userId) {
      if (!userId || !figmaBridge.isConnected(userId)) return textResult('Figma not connected', true);
      return serialFigmaCall(async () => {
        const result = await figmaBridge.sendCommand(userId, { action: 'get_node', nodeId: args.nodeId as string, depth: args.depth as number | undefined });
        return textResult(truncateFigmaResult(result));
      });
    },
  },
  {
    name: 'figma_export_node',
    description: 'Export a Figma node as PNG or SVG. WARNING: Exporting very large root components (full pages/dashboards) may timeout. Export smaller child sections instead.',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, format: { type: 'string', enum: ['PNG', 'SVG'] }, scale: { type: 'number', description: 'Export scale. Default 0.5. Use 1 only for small elements.' } }, required: ['nodeId'] },
    async handler(args, userId) {
      if (!userId || !figmaBridge.isConnected(userId)) return textResult('Figma not connected', true);
      return serialFigmaCall(async () => {
        const scale = Math.min(args.scale as number || 0.5, 1);
        try {
          const result = await figmaBridge.sendCommand(userId, { action: 'export_node', nodeId: args.nodeId as string, format: args.format as 'PNG' | 'SVG' | undefined, scale });
          if (result?.image) {
            const b64 = String(result.image).replace(/^data:image\/\w+;base64,/, '');
            return imageResult(b64, 'image/png');
          }
          return textResult(JSON.stringify(result, slimReplacer));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('timed out')) {
            return textResult(`Export timed out — the element is too large. Try exporting a smaller child node, or use scale=0.5.`, true);
          }
          return textResult(`Figma export error: ${msg}`, true);
        }
      });
    },
  },
  {
    name: 'figma_select_node',
    description: 'Select and focus a node in Figma.',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] },
    async handler(args, userId) {
      if (!userId || !figmaBridge.isConnected(userId)) return textResult('Figma not connected', true);
      return serialFigmaCall(async () => textResult(JSON.stringify(await figmaBridge.sendCommand(userId, { action: 'select_node', nodeId: args.nodeId as string }), slimReplacer)));
    },
  },
  {
    name: 'figma_search_nodes',
    description: 'Search Figma nodes by name.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, types: { type: 'array', items: { type: 'string' } } }, required: ['query'] },
    async handler(args, userId) {
      if (!userId || !figmaBridge.isConnected(userId)) return textResult('Figma not connected', true);
      return serialFigmaCall(async () => textResult(JSON.stringify(await figmaBridge.sendCommand(userId, { action: 'search_nodes', query: args.query as string, types: args.types as string[] | undefined }), slimReplacer)));
    },
  },
  {
    name: 'figma_get_fonts',
    description: 'Get fonts with CSS equivalents (cssFontFamily, cssFontWeight).',
    inputSchema: { type: 'object', properties: {} },
    async handler(_args, userId) {
      if (!userId || !figmaBridge.isConnected(userId)) return textResult('Figma not connected', true);
      return serialFigmaCall(async () => textResult(JSON.stringify(await figmaBridge.sendCommand(userId, { action: 'get_fonts' }), slimReplacer)));
    },
  },
  {
    name: 'figma_get_variables',
    description: 'Get design variables/tokens (colors, spacing, typography).',
    inputSchema: { type: 'object', properties: {} },
    async handler(_args, userId) {
      if (!userId || !figmaBridge.isConnected(userId)) return textResult('Figma not connected', true);
      return serialFigmaCall(async () => textResult(JSON.stringify(await figmaBridge.sendCommand(userId, { action: 'get_variables' }), slimReplacer)));
    },
  },
];

const toolMap = new Map(tools.map(t => [t.name, t]));

// ── SSE MCP Transport ────────────────────────────────────────────────
// Claude Code connects via: GET /mcp (SSE stream) + POST /mcp/message (JSON-RPC)

interface Session {
  res: any;
  userId?: string;
  writeQueue: Promise<void>;
}

/** Write to SSE session — synchronous, Node handles buffering */
function sessionWrite(session: Session, data: string): void {
  try {
    session.res.write(data);
  } catch {
    // Connection closed
  }
}

const sessions = new Map<string, Session>();

// GET /mcp — establish SSE connection
router.get('/', (req: any, res) => {
  const sessionId = crypto.randomUUID();
  const userId = req.query.userId as string || req.headers['x-user-id'] as string;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send the endpoint URI for posting messages
  res.write(`event: endpoint\ndata: /mcp/message?sessionId=${sessionId}\n\n`);

  sessions.set(sessionId, { res, userId, writeQueue: Promise.resolve() });

  // SSE keepalive — send a comment every 15s to prevent connection timeout
  const keepalive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepalive);
    }
  }, 15_000);

  req.on('close', () => {
    clearInterval(keepalive);
    sessions.delete(sessionId);
  });
});

// POST /mcp/message — receive JSON-RPC messages from Claude Code
router.post('/message', async (req: any, res) => {
  const sessionId = req.query.sessionId as string;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(400).json({ error: 'Invalid session' });
  }

  const msg = req.body;

  try {
    const response = await handleJsonRpc(msg, session.userId);
    if (response) {
      const json = JSON.stringify(response);
      console.log(`[MCP] SSE write: id=${response.id} size=${json.length}`);
      sessionWrite(session, `event: message\ndata: ${json}\n\n`);
    }
    res.status(202).send('Accepted');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

async function handleJsonRpc(msg: any, userId?: string): Promise<any> {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'adorable', version: '1.0.0' },
        },
      };

    case 'notifications/initialized':
      return null; // No response for notifications

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const tool = toolMap.get(toolName);

      if (!tool) {
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true } };
      }

      try {
        const result = await tool.handler(toolArgs, userId);
        return { jsonrpc: '2.0', id, result };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Error: ${message}` }], isError: true } };
      }
    }

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    default:
      if (id != null) {
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
      }
      return null;
  }
}

export { router as mcpAdorableRouter };
