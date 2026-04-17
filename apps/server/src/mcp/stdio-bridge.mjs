#!/usr/bin/env node
/**
 * Tiny stdio-to-SSE bridge for Claude Code MCP.
 *
 * Claude Code spawns this via .mcp.json (stdio transport).
 * This script connects to Adorable's HTTP MCP endpoint and bridges
 * JSON-RPC messages between stdio and HTTP.
 *
 * Auto-reconnects if the SSE connection drops.
 *
 * Environment: ADORABLE_MCP_URL (e.g. http://localhost:3333/mcp)
 */

import * as readline from 'readline';

const MCP_URL = process.env.ADORABLE_MCP_URL || 'http://localhost:3333/mcp';
let messageEndpoint = null;
let sseConnected = false;
let reconnecting = false;

// ── Connect to SSE endpoint ──────────────────────────────────────────

async function connectSSE() {
  try {
    const res = await fetch(MCP_URL, {
      headers: { 'Accept': 'text/event-stream' },
    });

    if (!res.ok || !res.body) {
      process.stderr.write(`[mcp-bridge] SSE connection failed: ${res.status}\n`);
      scheduleReconnect();
      return;
    }

    reconnecting = false;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const read = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          process.stderr.write('[mcp-bridge] SSE stream ended, reconnecting...\n');
          sseConnected = false;
          messageEndpoint = null;
          scheduleReconnect();
          return;
        }
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        let eventData = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData += line.slice(6);
          } else if (line === '') {
            // Empty line = end of SSE event — dispatch it
            if (eventType && eventData) {
              if (eventType === 'endpoint') {
                messageEndpoint = new URL(eventData, MCP_URL).href;
                sseConnected = true;
                process.stderr.write(`[mcp-bridge] Connected, endpoint: ${messageEndpoint}\n`);
                flushQueue();
              } else if (eventType === 'message') {
                process.stdout.write(eventData + '\n');
              }
            }
            // Reset for next event
            eventType = '';
            eventData = '';
          } else if (line.startsWith(':')) {
            // SSE comment (keepalive) — ignore
          }
        }
      }
    };

    read().catch(err => {
      process.stderr.write(`[mcp-bridge] SSE read error: ${err.message}\n`);
      sseConnected = false;
      messageEndpoint = null;
      scheduleReconnect();
    });
  } catch (err) {
    process.stderr.write(`[mcp-bridge] SSE connect error: ${err.message}\n`);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  setTimeout(() => {
    reconnecting = false;
    connectSSE();
  }, 2000);
}

// ── Send JSON-RPC message to server ──────────────────────────────────

const messageQueue = [];

function flushQueue() {
  while (messageQueue.length > 0 && messageEndpoint) {
    const msg = messageQueue.shift();
    sendMessage(msg);
  }
}

async function sendMessage(msg) {
  if (!messageEndpoint) {
    messageQueue.push(msg);
    return;
  }

  try {
    const res = await fetch(messageEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    if (!res.ok) {
      process.stderr.write(`[mcp-bridge] POST failed: ${res.status}\n`);
    }
  } catch (err) {
    process.stderr.write(`[mcp-bridge] POST error: ${err.message}\n`);
    // Connection lost — queue the message and reconnect
    messageQueue.push(msg);
    sseConnected = false;
    messageEndpoint = null;
    scheduleReconnect();
  }
}

// ── Read stdin (JSON-RPC from Claude Code) ───────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const msg = JSON.parse(trimmed);
    if (sseConnected) {
      sendMessage(msg);
    } else {
      messageQueue.push(msg);
    }
  } catch {
    // skip malformed
  }
});

rl.on('close', () => process.exit(0));

// ── Start ────────────────────────────────────────────────────────────

connectSSE();
