#!/usr/bin/env node
/**
 * Adorable MCP Server
 *
 * A standalone stdio MCP server that Claude Code spawns via .mcp.json.
 * Exposes Adorable's CDP browser tools, Figma bridge tools, and skill/lesson tools
 * so Claude Code can use them during generation.
 *
 * Communication:
 * - CDP tools → direct HTTP to localhost:{ADORABLE_AGENT_PORT}/api/native/cdp/*
 * - Figma/Skill/Lesson tools → HTTP to localhost:{ADORABLE_SERVER_PORT}/api/internal/bridge/*
 *
 * Environment variables (set via .mcp.json env block):
 * - ADORABLE_SERVER_PORT (default 3333)
 * - ADORABLE_AGENT_PORT (default 3334)
 * - ADORABLE_USER_ID
 * - ADORABLE_BRIDGE_TOKEN
 * - ADORABLE_PROJECT_PATH (project working directory)
 */

import * as readline from 'readline';

// ── Configuration ────────────────────────────────────────────────────

const SERVER_PORT = process.env['ADORABLE_SERVER_PORT'] || '3333';
const AGENT_PORT = process.env['ADORABLE_AGENT_PORT'] || '3334';
const USER_ID = process.env['ADORABLE_USER_ID'] || '';
const BRIDGE_TOKEN = process.env['ADORABLE_BRIDGE_TOKEN'] || '';
const PROJECT_PATH = process.env['ADORABLE_PROJECT_PATH'] || process.cwd();

const CDP_BASE = `http://localhost:${AGENT_PORT}/api/native/cdp`;
const BRIDGE_BASE = `http://localhost:${SERVER_PORT}/api/internal/bridge`;

// ── Tool Definitions ─────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

interface ToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

// Helper to create a text result
function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

// Helper to create an image result
function imageResult(base64: string, mimeType = 'image/jpeg'): ToolResult {
  return { content: [{ type: 'image', data: base64, mimeType }] };
}

// ── CDP Tool Helpers ─────────────────────────────────────────────────

async function cdpCall(endpoint: string, body: Record<string, unknown> = {}): Promise<string> {
  const res = await fetch(`${CDP_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`CDP ${endpoint} failed: ${res.status} ${await res.text()}`);
  }
  return res.text();
}

async function cdpCallJson(endpoint: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${CDP_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`CDP ${endpoint} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ── Bridge Helper ────────────────────────────────────────────────────

async function bridgeCall(path: string, body: Record<string, unknown> = {}, method = 'POST'): Promise<unknown> {
  const res = await fetch(`${BRIDGE_BASE}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-token': BRIDGE_TOKEN,
      'x-user-id': USER_ID,
    },
    body: method === 'GET' ? undefined : JSON.stringify({ ...body, userId: USER_ID }),
  });
  if (!res.ok) {
    throw new Error(`Bridge ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ── CDP Tools ────────────────────────────────────────────────────────

const cdpTools: ToolDef[] = [
  {
    name: 'browse_screenshot',
    description: 'Take a screenshot of the live preview. Returns the image. Use for visual verification after making changes.',
    inputSchema: {
      type: 'object',
      properties: {
        fullResolution: { type: 'boolean', description: 'Return at native display resolution for pixel-perfect comparison. Default false.' },
        quality: { type: 'number', description: 'JPEG quality 1-100. Default 80.' },
      },
    },
    async handler(args) {
      const raw = await cdpCall('screenshot', args);
      // CDP returns JSON with a base64 image field
      try {
        const data = JSON.parse(raw);
        if (data.image) {
          // Strip data URI prefix if present
          const base64 = data.image.replace(/^data:image\/\w+;base64,/, '');
          return imageResult(base64);
        }
        return textResult(raw);
      } catch {
        // If not JSON, might be raw base64
        return textResult(raw);
      }
    },
  },
  {
    name: 'browse_evaluate',
    description: 'Evaluate a JavaScript expression in the live preview page context. Useful for inspecting state, reading DOM properties, or interacting with Angular.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'JavaScript expression to evaluate. Can use await.' },
      },
      required: ['expression'],
    },
    async handler(args) {
      const result = await cdpCallJson('evaluate', args);
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'browse_accessibility',
    description: 'Get the accessibility tree of the live preview page. Useful for checking ARIA roles, labels, and screen reader experience.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const result = await cdpCallJson('accessibility');
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'browse_console',
    description: 'Read console messages from the live preview. Shows errors, warnings, and logs.',
    inputSchema: {
      type: 'object',
      properties: {
        clear: { type: 'boolean', description: 'Clear buffer after reading. Default true.' },
      },
    },
    async handler(args) {
      const result = await cdpCallJson('console', args);
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'browse_navigate',
    description: 'Navigate the live preview to a URL or route path.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL or path to navigate to.' },
      },
      required: ['url'],
    },
    async handler(args) {
      const result = await cdpCallJson('navigate', args);
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'browse_click',
    description: 'Click at a position in the live preview.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels.' },
        y: { type: 'number', description: 'Y coordinate in pixels.' },
      },
      required: ['x', 'y'],
    },
    async handler(args) {
      const result = await cdpCallJson('click', args);
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'type_text',
    description: 'Type text into the focused element in the live preview. Use {Enter}, {Tab}, {Escape}, {Backspace}, {ArrowUp}, etc. for special keys.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type. Use {Enter}, {Tab}, etc. for special keys.' },
      },
      required: ['text'],
    },
    async handler(args) {
      const result = await cdpCallJson('type', args);
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'inspect_component',
    description: 'Inspect Angular components in the live preview. Shows component tree with ONG annotations, bindings, inputs/outputs, and source file locations.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or _ong ID for a specific component. Omit for full tree.' },
      },
    },
    async handler(args) {
      const result = await cdpCallJson('evaluate', {
        expression: args.selector
          ? `window.__ong?.getComponentInfo?.('${args.selector}') || document.querySelector('${args.selector}')?.outerHTML?.substring(0, 500)`
          : `window.__ong?.getComponentTree?.() || 'ONG annotations not available'`,
      });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'inspect_routes',
    description: 'List all registered Angular routes in the live preview.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const result = await cdpCallJson('evaluate', {
        expression: `window.__ong?.getRoutes?.() || 'Routes not available'`,
      });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'inspect_signals',
    description: 'Inspect Angular signals state in the live preview.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const result = await cdpCallJson('evaluate', {
        expression: `window.__ong?.getSignals?.() || 'Signals not available'`,
      });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'inspect_errors',
    description: 'Get runtime errors from the live preview.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const result = await cdpCallJson('evaluate', {
        expression: `window.__ong?.getErrors?.() || 'Error tracking not available'`,
      });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'inspect_styles',
    description: 'Get computed styles for an element in the live preview.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element.' },
      },
      required: ['selector'],
    },
    async handler(args) {
      const result = await cdpCallJson('evaluate', {
        expression: `(() => {
          const el = document.querySelector('${args.selector}');
          if (!el) return 'Element not found';
          const s = getComputedStyle(el);
          return JSON.stringify({
            display: s.display, position: s.position, width: s.width, height: s.height,
            margin: s.margin, padding: s.padding, color: s.color, background: s.background,
            fontSize: s.fontSize, fontFamily: s.fontFamily, fontWeight: s.fontWeight,
            border: s.border, borderRadius: s.borderRadius, flexDirection: s.flexDirection,
            justifyContent: s.justifyContent, alignItems: s.alignItems, gap: s.gap,
          });
        })()`,
      });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'inspect_dom',
    description: 'Get the DOM structure for an element in the live preview.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element.' },
        depth: { type: 'number', description: 'Max child depth. Default 3. Use -1 for full.' },
      },
      required: ['selector'],
    },
    async handler(args) {
      const depth = args.depth ?? 3;
      const result = await cdpCallJson('evaluate', {
        expression: `(() => {
          const el = document.querySelector('${args.selector}');
          if (!el) return 'Element not found';
          function walk(node, d) {
            if (d === 0) return { tag: node.tagName?.toLowerCase(), children: '...' };
            const obj = { tag: node.tagName?.toLowerCase(), id: node.id || undefined, class: node.className || undefined };
            if (node.children.length > 0 && d !== 0) {
              obj.children = Array.from(node.children).map(c => walk(c, d - 1));
            }
            return obj;
          }
          return JSON.stringify(walk(el, ${depth}));
        })()`,
      });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'measure_element',
    description: 'Measure an element\'s bounding box, computed styles, and position in the live preview.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element.' },
      },
      required: ['selector'],
    },
    async handler(args) {
      const result = await cdpCallJson('evaluate', {
        expression: `(() => {
          const el = document.querySelector('${args.selector}');
          if (!el) return 'Element not found';
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return JSON.stringify({
            x: r.x, y: r.y, width: r.width, height: r.height,
            margin: s.margin, padding: s.padding,
            fontSize: s.fontSize, lineHeight: s.lineHeight,
          });
        })()`,
      });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'inject_css',
    description: 'Inject or clear CSS rules in the live preview for quick visual experiments.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'clear'], description: '"add" to inject, "clear" to remove.' },
        css: { type: 'string', description: 'CSS rules (for "add" action).' },
      },
      required: ['action'],
    },
    async handler(args) {
      const result = await cdpCallJson('evaluate', {
        expression: args.action === 'clear'
          ? `document.getElementById('adorable-injected-css')?.remove(); 'Cleared'`
          : `(() => {
              let s = document.getElementById('adorable-injected-css');
              if (!s) { s = document.createElement('style'); s.id = 'adorable-injected-css'; document.head.appendChild(s); }
              s.textContent += '${String(args.css || '').replace(/'/g, "\\'")}';
              return 'Injected';
            })()`,
      });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'get_bundle_stats',
    description: 'Get JavaScript bundle statistics from the live preview.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const result = await cdpCallJson('evaluate', {
        expression: `(() => {
          const scripts = Array.from(document.querySelectorAll('script[src]'));
          return JSON.stringify(scripts.map(s => ({ src: s.src, async: s.async, defer: s.defer })));
        })()`,
      });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'inspect_network',
    description: 'Monitor network requests in the live preview. Use "start" to begin, "get" to read, "clear" to reset.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'get', 'clear'], description: 'Action to perform.' },
      },
      required: ['action'],
    },
    async handler(args) {
      const result = await cdpCallJson('network', args);
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'clear_build_cache',
    description: 'Clear the Angular build cache (node_modules/.cache, .angular/cache).',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const result = await cdpCallJson('system', { action: 'clear-cache' });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'get_container_logs',
    description: 'Get recent logs from the dev server process.',
    inputSchema: {
      type: 'object',
      properties: {
        lines: { type: 'number', description: 'Number of log lines. Default 50.' },
      },
    },
    async handler(args) {
      const result = await cdpCallJson('system', { action: 'logs', lines: args.lines || 50 });
      return textResult(JSON.stringify(result, null, 2));
    },
  },
];

// ── Figma Tools ──────────────────────────────────────────────────────

const figmaTools: ToolDef[] = [
  {
    name: 'figma_get_selection',
    description: 'Get the currently selected nodes in Figma. Returns the node tree structure with styles, layout, and text content.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const result = await bridgeCall('figma/get_selection') as Record<string, unknown>;
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'figma_get_node',
    description: 'Get detailed information about a specific Figma node by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Figma node ID (e.g., "1:23").' },
        includeImage: { type: 'boolean', description: 'Export the node as PNG. Default true.' },
      },
      required: ['nodeId'],
    },
    async handler(args) {
      const result = await bridgeCall('figma/get_node', args as Record<string, unknown>) as Record<string, unknown>;
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'figma_export_node',
    description: 'Export a Figma node as PNG or SVG image.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Figma node ID to export.' },
        format: { type: 'string', enum: ['PNG', 'SVG'], description: 'Export format. Default PNG.' },
        scale: { type: 'number', description: 'Scale for PNG (1-4). Default 2.' },
      },
      required: ['nodeId'],
    },
    async handler(args) {
      const result = await bridgeCall('figma/export_node', args as Record<string, unknown>) as Record<string, unknown>;
      // Check if result contains an image
      const inner = (result as any).result;
      if (inner?.image) {
        const base64 = String(inner.image).replace(/^data:image\/\w+;base64,/, '');
        return imageResult(base64, 'image/png');
      }
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'figma_select_node',
    description: 'Select a node in Figma by ID. Moves the Figma viewport to focus on it.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Figma node ID to select.' },
      },
      required: ['nodeId'],
    },
    async handler(args) {
      const result = await bridgeCall('figma/select_node', args as Record<string, unknown>);
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'figma_search_nodes',
    description: 'Search for nodes in the Figma document by name.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (case-insensitive partial match on node names).' },
        types: { type: 'array', items: { type: 'string' }, description: 'Filter by node types (e.g., ["FRAME", "COMPONENT", "TEXT"]).' },
      },
      required: ['query'],
    },
    async handler(args) {
      const result = await bridgeCall('figma/search_nodes', args as Record<string, unknown>);
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'figma_get_fonts',
    description: 'Get all fonts used in the Figma document with their CSS equivalents (cssFontFamily, cssFontWeight).',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const result = await bridgeCall('figma/get_fonts');
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'figma_get_variables',
    description: 'Get all design variables (tokens) from the Figma document — colors, spacing, typography, etc.',
    inputSchema: { type: 'object', properties: {} },
    async handler() {
      const result = await bridgeCall('figma/get_variables');
      return textResult(JSON.stringify(result, null, 2));
    },
  },
];

// ── Skill/Lesson Tools ───────────────────────────────────────────────

const skillTools: ToolDef[] = [
  {
    name: 'activate_skill',
    description: 'Activate a skill to get specialized instructions and context for a particular task (e.g., "figma-bridge", "angular-expert").',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the skill to activate.' },
      },
      required: ['name'],
    },
    async handler(args) {
      const result = await bridgeCall('skill/activate', {
        skillName: args.name,
        projectPath: PROJECT_PATH,
      }) as Record<string, unknown>;
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'read_skill_reference',
    description: 'Read a reference file from an activated skill (documentation, examples, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        skillName: { type: 'string', description: 'Name of the skill.' },
        filename: { type: 'string', description: 'Reference filename to read.' },
      },
      required: ['skillName', 'filename'],
    },
    async handler(args) {
      const result = await bridgeCall('skill/read-reference', {
        skillName: args.skillName,
        filename: args.filename,
        projectPath: PROJECT_PATH,
      }) as Record<string, unknown>;
      return textResult(JSON.stringify(result, null, 2));
    },
  },
  {
    name: 'save_lesson',
    description: 'Save a lesson learned about a component kit pattern — what went wrong and what works.',
    inputSchema: {
      type: 'object',
      properties: {
        kitId: { type: 'string', description: 'Component kit ID.' },
        title: { type: 'string', description: 'Short summary of the lesson.' },
        problem: { type: 'string', description: 'What went wrong.' },
        solution: { type: 'string', description: 'What works.' },
        component: { type: 'string', description: 'Primary component involved.' },
        codeSnippet: { type: 'string', description: 'Example code.' },
        tags: { type: 'string', description: 'Comma-separated tags.' },
      },
      required: ['kitId', 'title', 'problem', 'solution'],
    },
    async handler(args) {
      const result = await bridgeCall('lesson/save', args as Record<string, unknown>);
      return textResult(JSON.stringify(result, null, 2));
    },
  },
];

// ── All Tools ────────────────────────────────────────────────────────

const allTools: ToolDef[] = [...cdpTools, ...figmaTools, ...skillTools];
const toolMap = new Map(allTools.map(t => [t.name, t]));

// ── JSON-RPC over stdio (MCP Protocol) ──────────────────────────────

let requestId = 0;

function sendResponse(id: number | string | null, result: unknown): void {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(msg + '\n');
}

function sendError(id: number | string | null, code: number, message: string): void {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.write(msg + '\n');
}

function sendNotification(method: string, params?: unknown): void {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
  process.stdout.write(msg + '\n');
}

async function handleRequest(req: { id: number | string; method: string; params?: any }): Promise<void> {
  const { id, method, params } = req;

  switch (method) {
    case 'initialize':
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'adorable',
          version: '1.0.0',
        },
      });
      break;

    case 'notifications/initialized':
      // Client ack — nothing to do
      break;

    case 'tools/list':
      sendResponse(id, {
        tools: allTools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
      break;

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const tool = toolMap.get(toolName);

      if (!tool) {
        sendResponse(id, {
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
          isError: true,
        });
        break;
      }

      try {
        const result = await tool.handler(toolArgs);
        sendResponse(id, result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse(id, {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        });
      }
      break;
    }

    case 'ping':
      sendResponse(id, {});
      break;

    default:
      // Method not found
      if (id != null) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
  }
}

// ── Main ─────────────────────────────────────────────────────────────

function main(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const msg = JSON.parse(trimmed);

      if (msg.method && msg.id != null) {
        // Request
        await handleRequest(msg);
      } else if (msg.method && msg.id == null) {
        // Notification — handle silently
        await handleRequest(msg);
      }
      // Ignore responses (we don't send requests)
    } catch {
      // Malformed JSON — ignore
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });

  // Signal readiness via stderr (stdout is for JSON-RPC)
  process.stderr.write('[adorable-mcp] Server started\n');
}

main();
