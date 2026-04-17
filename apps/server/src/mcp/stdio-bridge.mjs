#!/usr/bin/env node
/**
 * Tiny stdio-to-SSE bridge for Claude Code MCP.
 *
 * Claude Code spawns this via .mcp.json (stdio transport).
 * This script connects to Adorable's HTTP MCP endpoint and bridges
 * JSON-RPC messages between stdio and HTTP.
 *
 * Environment: ADORABLE_MCP_URL (e.g. http://localhost:3333/mcp)
 */

import * as readline from 'readline';

const MCP_URL = process.env.ADORABLE_MCP_URL || 'http://localhost:3333/mcp';
let messageEndpoint = null;
let sseConnected = false;

// ── Connect to SSE endpoint ──────────────────────────────────────────

async function connectSSE() {
  try {
    const res = await fetch(MCP_URL, {
      headers: { 'Accept': 'text/event-stream' },
    });

    if (!res.ok || !res.body) {
      process.stderr.write(`[mcp-bridge] SSE connection failed: ${res.status}\n`);
      process.exit(1);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const read = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (eventType === 'endpoint') {
              // Server tells us where to POST messages
              messageEndpoint = new URL(data, MCP_URL).href;
              sseConnected = true;
              process.stderr.write(`[mcp-bridge] Connected, message endpoint: ${messageEndpoint}\n`);
              // Process any queued messages
              flushQueue();
            } else if (eventType === 'message') {
              // Server sends a JSON-RPC response
              process.stdout.write(data + '\n');
            }
          }
        }
      }
    };

    read().catch(err => {
      process.stderr.write(`[mcp-bridge] SSE read error: ${err.message}\n`);
      process.exit(1);
    });
  } catch (err) {
    process.stderr.write(`[mcp-bridge] SSE connect error: ${err.message}\n`);
    process.exit(1);
  }
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
    await fetch(messageEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
  } catch (err) {
    process.stderr.write(`[mcp-bridge] POST error: ${err.message}\n`);
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
