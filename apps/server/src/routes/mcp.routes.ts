import express from 'express';
import { authenticate } from '../middleware/auth';
import { MCPClient } from '../mcp/mcp-client';
import { MCPStdioClient } from '../mcp/mcp-stdio-client';
import { MCPManager } from '../mcp/mcp-manager';
import { MCPServerConfig, MCPTransport } from '../mcp/types';
import { decrypt } from '../utils/crypto';

const router = express.Router();

router.use(authenticate);

/**
 * Test connection to an MCP server
 * POST /api/mcp/test
 */
router.post('/test', async (req: any, res) => {
  const { transport, url, authType, apiKey, name, command, args, env } = req.body;
  const transportType: MCPTransport = transport || 'http';

  if (transportType === 'http') {
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required for HTTP transport' });
    }

    // Validate URL
    try {
      const parsedUrl = new URL(url);

      // In production, require HTTPS
      if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({
          success: false,
          error: 'HTTPS is required in production'
        });
      }

      // Block private IPs in cloud mode (SSRF prevention)
      if (process.env.CLOUD_MODE === 'true') {
        const hostname = parsedUrl.hostname;
        const privatePatterns = [
          /^localhost$/i,
          /^127\./,
          /^10\./,
          /^172\.(1[6-9]|2[0-9]|3[01])\./,
          /^192\.168\./,
          /^0\./,
          /^::1$/,
          /^fc00:/i,
          /^fe80:/i,
        ];

        if (privatePatterns.some(p => p.test(hostname))) {
          return res.status(400).json({
            success: false,
            error: 'Private network URLs are not allowed'
          });
        }
      }
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid URL format' });
    }

    // Create temporary config for testing HTTP
    const config: MCPServerConfig = {
      id: 'test',
      name: name || 'Test Server',
      transport: 'http',
      url,
      authType: authType || 'none',
      apiKey: apiKey,
      enabled: true,
    };

    const client = new MCPClient(config);
    const result = await client.testConnection();
    res.json(result);

  } else if (transportType === 'stdio') {
    // stdio transport - only allowed in desktop mode
    if (process.env.CLOUD_MODE === 'true') {
      return res.status(400).json({
        success: false,
        error: 'stdio transport is not available in cloud mode'
      });
    }

    if (!command) {
      return res.status(400).json({ success: false, error: 'Command is required for stdio transport' });
    }

    // Create temporary config for testing stdio
    const config: MCPServerConfig = {
      id: 'test',
      name: name || 'Test Server',
      transport: 'stdio',
      command,
      args: args || [],
      env: env || {},
      enabled: true,
    };

    const client = new MCPStdioClient(config);
    try {
      const result = await client.testConnection();
      client.dispose();
      res.json(result);
    } catch (error) {
      client.dispose();
      res.json({
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      });
    }
  } else {
    return res.status(400).json({ success: false, error: 'Invalid transport type' });
  }
});

/**
 * Preview available tools from an MCP server
 * POST /api/mcp/tools
 */
router.post('/tools', async (req: any, res) => {
  const { url, authType, apiKey, name } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Create temporary config
  const config: MCPServerConfig = {
    id: 'preview',
    name: name || 'Preview Server',
    transport: 'http',
    url,
    authType: authType || 'none',
    apiKey: apiKey,
    enabled: true,
  };

  const client = new MCPClient(config);

  try {
    const tools = await client.listTools(true);
    res.json({
      tools: tools.map(t => ({
        name: t.name,
        originalName: t.originalName,
        description: t.description,
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list tools'
    });
  }
});

/**
 * Get all available MCP tools for the current user
 * Based on their configured and enabled MCP servers
 * GET /api/mcp/available-tools
 */
router.get('/available-tools', async (req: any, res) => {
  const user = req.user;

  if (!user.settings) {
    return res.json({ servers: [], tools: [] });
  }

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings)
      : user.settings;

    const mcpServers: MCPServerConfig[] = settings.mcpServers || [];
    const enabledServers = mcpServers.filter(s => s.enabled);

    if (enabledServers.length === 0) {
      return res.json({ servers: [], tools: [] });
    }

    // Decrypt API keys
    const decryptedServers = enabledServers.map(server => {
      if (server.apiKey && server.apiKey.includes(':')) {
        try {
          return { ...server, apiKey: decrypt(server.apiKey) };
        } catch {
          return server;
        }
      }
      return server;
    });

    // Initialize MCP manager and get tools
    const manager = new MCPManager();
    await manager.initialize(decryptedServers);
    const tools = await manager.getAllTools();

    // Return server info and tools
    res.json({
      servers: enabledServers.map(s => ({
        id: s.id,
        name: s.name,
        url: s.url,
        enabled: s.enabled
      })),
      tools: tools.map(t => ({
        name: t.name,
        originalName: t.originalName,
        description: t.description,
        serverId: t.serverId
      }))
    });
  } catch (error) {
    console.error('Failed to get available MCP tools:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get tools'
    });
  }
});

export const mcpRouter = router;
