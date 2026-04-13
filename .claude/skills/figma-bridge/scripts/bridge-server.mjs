#!/usr/bin/env node
// Standalone Figma Live Bridge server — runs independently of Adorable.
// Provides the same WebSocket protocol + HTTP API the Adorable server exposes,
// scoped down to a single local plugin connection. Zero dependencies.
//
// Usage:
//   bridge-server.mjs              # listens on :7777
//   PORT=8080 bridge-server.mjs    # custom port
//
// Point the Adorable Figma plugin at ws://localhost:7777/ws/figma-bridge

import http from 'http';
import crypto from 'crypto';

const PORT = Number(process.env.PORT) || 7777;

// ====================================================================
// Minimal WebSocket (RFC 6455) — text frames, ping/pong, close only
// ====================================================================

function acceptKey(key) {
  return crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
}

function encodeFrame(payload, opcode = 0x1) {
  const buf = Buffer.from(payload, 'utf8');
  const len = buf.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, buf]);
}

// Stateful decoder: accumulates buffer across chunks, yields complete frames.
function createDecoder() {
  let buf = Buffer.alloc(0);
  return function push(chunk) {
    buf = Buffer.concat([buf, chunk]);
    const frames = [];
    while (buf.length >= 2) {
      const b0 = buf[0], b1 = buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;
      if (payloadLen === 126) {
        if (buf.length < 4) break;
        payloadLen = buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buf.length < 10) break;
        payloadLen = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }
      let mask = null;
      if (masked) {
        if (buf.length < offset + 4) break;
        mask = buf.slice(offset, offset + 4);
        offset += 4;
      }
      if (buf.length < offset + payloadLen) break;
      let payload = Buffer.from(buf.slice(offset, offset + payloadLen));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      frames.push({ opcode, payload });
      buf = buf.slice(offset + payloadLen);
    }
    return frames;
  };
}

// ====================================================================
// Bridge state — single connection, pending request tracking
// ====================================================================

let pluginSocket = null;
let pluginInfo = null; // { fileKey, fileName }
const pendingRequests = new Map(); // requestId -> { resolve, reject, timer }
let lastSelection = [];

function sendToPlugin(msg) {
  if (!pluginSocket) throw new Error('Figma plugin not connected');
  pluginSocket.write(encodeFrame(JSON.stringify(msg)));
}

function sendCommand(command, timeoutMs = 60000) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    pendingRequests.set(requestId, { resolve, reject, timer });
    try {
      sendToPlugin({ type: 'figma:request', requestId, command });
    } catch (err) {
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      reject(err);
    }
  });
}

function handlePluginMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  switch (msg.type) {
    case 'figma:hello':
      pluginInfo = { fileKey: msg.fileKey, fileName: msg.fileName };
      console.log(`[bridge] plugin connected: ${msg.fileName} (${msg.fileKey})`);
      // Plugin expects a token back for reconnect; send a dummy (we trust localhost)
      sendToPlugin({ type: 'figma:auth', token: 'standalone-local' });
      break;
    case 'figma:selection_changed':
      lastSelection = msg.selection || [];
      break;
    case 'figma:document_changed':
      // Not surfaced via HTTP yet — could add SSE later
      break;
    case 'figma:response': {
      const pending = pendingRequests.get(msg.requestId);
      if (pending) {
        pendingRequests.delete(msg.requestId);
        clearTimeout(pending.timer);
        if (msg.error) pending.reject(new Error(msg.error));
        else pending.resolve(msg.data);
      }
      break;
    }
  }
}

// ====================================================================
// HTTP + WebSocket server
// ====================================================================

async function handleHttp(req, res) {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  // Read JSON body if present
  let body = null;
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw) { try { body = JSON.parse(raw); } catch { /* ignore */ } }
  }

  try {
    if (req.url === '/status' && req.method === 'GET') {
      if (pluginInfo && pluginSocket) {
        return send(200, { connected: true, ...pluginInfo, selection: lastSelection });
      }
      return send(200, { connected: false });
    }
    if (req.url === '/grab-selection' && req.method === 'POST') {
      if (!pluginSocket) return send(400, { error: 'Figma plugin not connected' });
      const result = await sendCommand({ action: 'get_selection' });
      return send(200, { ...pluginInfo, ...result });
    }
    if (req.url === '/get-node' && req.method === 'POST') {
      if (!pluginSocket) return send(400, { error: 'Figma plugin not connected' });
      if (!body?.nodeId) return send(400, { error: 'nodeId required' });
      const cmd = { action: 'get_node', nodeId: body.nodeId };
      if (typeof body.depth === 'number') cmd.depth = body.depth;
      const result = await sendCommand(cmd);
      return send(200, result);
    }
    if (req.url === '/get-fonts' && req.method === 'POST') {
      if (!pluginSocket) return send(400, { error: 'Figma plugin not connected' });
      const result = await sendCommand({ action: 'get_fonts' });
      return send(200, result);
    }
    if (req.url === '/get-variables' && req.method === 'POST') {
      if (!pluginSocket) return send(400, { error: 'Figma plugin not connected' });
      const result = await sendCommand({ action: 'get_variables' });
      return send(200, result);
    }
    if (req.url === '/export-node' && req.method === 'POST') {
      if (!pluginSocket) return send(400, { error: 'Figma plugin not connected' });
      if (!body?.nodeId) return send(400, { error: 'nodeId required' });
      const cmd = { action: 'export_node', nodeId: body.nodeId, scale: body.scale || 2 };
      if (body.format === 'SVG') cmd.format = 'SVG';
      const result = await sendCommand(cmd);
      return send(200, result);
    }
    if (req.url === '/select-node' && req.method === 'POST') {
      if (!pluginSocket) return send(400, { error: 'Figma plugin not connected' });
      if (!body?.nodeId) return send(400, { error: 'nodeId required' });
      const result = await sendCommand({ action: 'select_node', nodeId: body.nodeId });
      return send(200, result);
    }
    if (req.url === '/search-nodes' && req.method === 'POST') {
      if (!pluginSocket) return send(400, { error: 'Figma plugin not connected' });
      const result = await sendCommand({
        action: 'search_nodes',
        query: body?.query || '',
        types: body?.types,
      });
      return send(200, { results: result });
    }
    send(404, { error: 'Not found' });
  } catch (err) {
    send(500, { error: err.message });
  }
}

function handleUpgrade(req, socket) {
  const pathname = req.url.split('?')[0];
  if (pathname !== '/ws/figma-bridge') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.end();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.end(); return; }

  const accept = acceptKey(key);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  // Replace any previous connection
  if (pluginSocket && pluginSocket !== socket) {
    try { pluginSocket.end(); } catch { /* ignore */ }
  }
  pluginSocket = socket;
  pluginInfo = null;

  const decode = createDecoder();
  socket.on('data', (chunk) => {
    for (const frame of decode(chunk)) {
      if (frame.opcode === 0x1) {
        handlePluginMessage(frame.payload.toString('utf8'));
      } else if (frame.opcode === 0x8) {
        // Close
        socket.end();
      } else if (frame.opcode === 0x9) {
        // Ping → Pong
        socket.write(encodeFrame(frame.payload.toString('utf8'), 0xA));
      }
    }
  });

  const cleanup = () => {
    if (pluginSocket === socket) {
      pluginSocket = null;
      pluginInfo = null;
      console.log('[bridge] plugin disconnected');
    }
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

const server = http.createServer(handleHttp);
server.on('upgrade', handleUpgrade);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] listening on http://localhost:${PORT}`);
  console.log(`[bridge] point Figma plugin to ws://localhost:${PORT}/ws/figma-bridge`);
});
