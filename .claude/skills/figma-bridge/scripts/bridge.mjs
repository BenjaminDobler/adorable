#!/usr/bin/env node
// Thin CLI wrapper over the Adorable Figma Live Bridge HTTP API.
// Requires: running Adorable server + connected Figma plugin.
// Auth: set ADORABLE_TOKEN env var (JWT from browser localStorage key "adorable_token").

// Mode detection:
//   BRIDGE_MODE=standalone  -> talk to standalone skill server (default http://localhost:7777)
//   BRIDGE_MODE=adorable    -> talk to Adorable server (default http://localhost:3333)
//   (unset)                 -> auto-detect: try standalone first, fall back to adorable
const MODE = process.env.BRIDGE_MODE;
const STANDALONE_BASE = process.env.BRIDGE_SERVER || 'http://localhost:7777';
const ADORABLE_BASE = process.env.ADORABLE_SERVER || 'http://localhost:3333';
const TOKEN = process.env.ADORABLE_TOKEN;

// Standalone server exposes endpoints at the root; Adorable prefixes with /api/figma/bridge
function urlFor(base, path, standalone) {
  return standalone ? `${base}${path}` : `${base}/api/figma/bridge${path}`;
}

let resolvedBase = null;
let resolvedStandalone = null;

async function resolveServer() {
  if (resolvedBase) return;
  const tryServer = async (base, standalone) => {
    try {
      const res = await fetch(urlFor(base, '/status', standalone), {
        headers: TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {},
      });
      return res.ok || res.status === 401; // 401 still means server is there
    } catch { return false; }
  };
  if (MODE === 'standalone') {
    resolvedBase = STANDALONE_BASE; resolvedStandalone = true; return;
  }
  if (MODE === 'adorable') {
    resolvedBase = ADORABLE_BASE; resolvedStandalone = false; return;
  }
  // Auto-detect
  if (await tryServer(STANDALONE_BASE, true)) {
    resolvedBase = STANDALONE_BASE; resolvedStandalone = true;
  } else if (await tryServer(ADORABLE_BASE, false)) {
    resolvedBase = ADORABLE_BASE; resolvedStandalone = false;
  } else {
    console.error('No bridge server reachable. Either:');
    console.error(`  - Start the standalone server:  scripts/bridge-server.mjs`);
    console.error(`  - Or start Adorable:             npx nx serve server`);
    process.exit(1);
  }
}

async function api(method, path, body) {
  await resolveServer();
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN && !resolvedStandalone) headers['Authorization'] = `Bearer ${TOKEN}`;

  const res = await fetch(urlFor(resolvedBase, path, resolvedStandalone), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    if (res.status === 401 && !TOKEN) {
      console.error('Auth required (talking to Adorable server). Options:');
      console.error('  1) Use the standalone server instead (zero auth): scripts/bridge-server.mjs');
      console.error('     Then set the plugin URL to ws://localhost:7777/ws/figma-bridge');
      console.error('  2) Enable local access: set ADORABLE_CLI_LOCAL_ACCESS=true in Adorable .env, restart');
      console.error('  3) Or set ADORABLE_TOKEN: localStorage.getItem("adorable_token") in browser DevTools');
    } else {
      console.error(`HTTP ${res.status}: ${json?.error || text}`);
    }
    process.exit(1);
  }
  return json;
}

// Strip heavy fields (images, deeply nested children) for readable output.
function slim(data, opts = {}) {
  const { dropImages = true, maxDepth = 3 } = opts;
  const walk = (v, depth) => {
    if (v == null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(x => walk(x, depth));
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (dropImages && (k === 'imageDataUris' || k === 'image')) {
        out[k] = Array.isArray(val) ? `[${val.length} images omitted]` : '[image omitted]';
        continue;
      }
      if (k === 'children' && depth >= maxDepth) {
        out[k] = `[${Array.isArray(val) ? val.length : '?'} children truncated at depth ${maxDepth}]`;
        continue;
      }
      out[k] = walk(val, depth + 1);
    }
    return out;
  };
  return walk(data, 0);
}

const [, , cmd, ...args] = process.argv;

const commands = {
  async status() {
    const r = await api('GET', '/status');
    console.log(JSON.stringify(r, null, 2));
  },

  async selection() {
    const r = await api('POST', '/grab-selection', {});
    console.log(JSON.stringify(slim(r), null, 2));
  },

  async 'get-node'() {
    const nodeId = args[0];
    const depth = args[1] ? parseInt(args[1], 10) : undefined;
    if (!nodeId) { console.error('Usage: get-node <nodeId> [depth]'); process.exit(2); }
    const body = { nodeId, includeImage: false };
    if (typeof depth === 'number' && !isNaN(depth)) body.depth = depth;
    const r = await api('POST', '/get-node', body);
    const slimDepth = depth != null ? depth + 1 : 5;
    console.log(JSON.stringify(slim(r, { maxDepth: slimDepth }), null, 2));
  },

  async 'export-node'() {
    const nodeId = args[0];
    const format = (args[1] || 'PNG').toUpperCase();
    if (!nodeId) { console.error('Usage: export-node <nodeId> [PNG|SVG]'); process.exit(2); }
    const r = await api('POST', '/export-node', { nodeId, format, scale: 2 });
    if (format === 'SVG' && r.svg) {
      console.log(r.svg);
    } else {
      console.log(JSON.stringify(r, null, 2));
    }
  },

  async 'get-fonts'() {
    const r = await api('POST', '/get-fonts', {});
    console.log(JSON.stringify(r, null, 2));
  },

  async 'get-variables'() {
    const r = await api('POST', '/get-variables', {});
    console.log(JSON.stringify(r, null, 2));
  },

  async serve() {
    const { spawn } = await import('child_process');
    const path = await import('path');
    const url = await import('url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const serverPath = path.join(here, 'bridge-server.mjs');
    const child = spawn(process.execPath, [serverPath], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code || 0));
  },

  help() {
    console.log(`Figma Live Bridge CLI

Usage: bridge.mjs <command> [args]

Commands:
  serve                  Start the standalone bridge server (no Adorable needed)
  status                 Check if the Figma plugin is connected
  selection              Get current Figma selection (with structure, images omitted)
  get-node <nodeId>      Get a specific node's structure
  get-variables          Extract design tokens (Figma local variables)
  help                   Show this help

Modes (auto-detected):
  standalone   Talks to scripts/bridge-server.mjs at http://localhost:7777
  adorable     Talks to Adorable server at http://localhost:3333

Env:
  BRIDGE_MODE         Force "standalone" or "adorable" (otherwise auto-detect)
  BRIDGE_SERVER       Standalone server URL (default: http://localhost:7777)
  ADORABLE_SERVER     Adorable server URL  (default: http://localhost:3333)
  ADORABLE_TOKEN      JWT for Adorable mode (not needed in standalone or with CLI local access)
`);
  },
};

if (!cmd || cmd === '--help' || cmd === '-h') {
  commands.help();
  process.exit(0);
}

const fn = commands[cmd];
if (!fn) {
  console.error(`Unknown command: ${cmd}`);
  commands.help();
  process.exit(2);
}
await fn();
