import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';
import { decrypt } from '../utils/crypto';
import { prisma } from '../db/prisma';
import { JWT_SECRET } from '../config';
import { figmaBridge } from '../services/figma-bridge.service';

const router = express.Router();
const FIGMA_API_BASE = 'https://api.figma.com/v1';

// Connection codes: code -> { userId, expiresAt }
const pendingCodes = new Map<string, { userId: string; expiresAt: number }>();

/**
 * POST /bridge/verify-code - Plugin exchanges connection code for a WebSocket JWT
 * This endpoint is PUBLIC (no auth) — the code itself proves authorization.
 */
router.post('/bridge/verify-code', async (req: any, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Code required' });
  }

  const entry = pendingCodes.get(code.toUpperCase());
  if (!entry || entry.expiresAt < Date.now()) {
    pendingCodes.delete(code);
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  pendingCodes.delete(code);

  // Issue a long-lived WebSocket token
  const wsToken = jwt.sign({ userId: entry.userId }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token: wsToken });
});

/**
 * GET /bridge/events - SSE stream for bridge events
 * Pre-auth because EventSource doesn't support custom headers.
 * Accepts token as query param or Authorization header.
 */
router.get('/bridge/events', async (req: any, res) => {
  // Manual auth: query param token or Authorization header
  const token = req.query.token || req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let userId: string;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    userId = decoded.userId;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial status
  const info = figmaBridge.getConnectionInfo(userId);
  if (info) {
    send({ type: 'figma:connected', fileKey: info.fileKey, fileName: info.fileName });
  }

  const onConnected = (connUserId: string, connInfo: { fileKey: string; fileName: string }) => {
    if (connUserId === userId) {
      send({ type: 'figma:connected', fileKey: connInfo.fileKey, fileName: connInfo.fileName });
    }
  };

  const onDisconnected = (connUserId: string) => {
    if (connUserId === userId) {
      send({ type: 'figma:disconnected' });
    }
  };

  const onSelectionChanged = (connUserId: string, data: any) => {
    if (connUserId === userId) {
      send({ type: 'figma:selection_update', ...data });
    }
  };

  const onDocumentChanged = (connUserId: string, data: any) => {
    if (connUserId === userId) {
      send({ type: 'figma:document_changed', ...data });
    }
  };

  figmaBridge.on('connected', onConnected);
  figmaBridge.on('disconnected', onDisconnected);
  figmaBridge.on('selection_changed', onSelectionChanged);
  figmaBridge.on('document_changed', onDocumentChanged);

  req.on('close', () => {
    figmaBridge.off('connected', onConnected);
    figmaBridge.off('disconnected', onDisconnected);
    figmaBridge.off('selection_changed', onSelectionChanged);
    figmaBridge.off('document_changed', onDocumentChanged);
  });
});

/**
 * Verify a bridge connection code and return userId + JWT.
 * Exported for use by the WebSocket upgrade handler in main.ts.
 */
export function verifyBridgeCode(code: string): { userId: string; token: string } | null {
  const entry = pendingCodes.get(code.toUpperCase());
  if (!entry || entry.expiresAt < Date.now()) {
    pendingCodes.delete(code);
    return null;
  }
  pendingCodes.delete(code);
  const token = jwt.sign({ userId: entry.userId }, JWT_SECRET, { expiresIn: '30d' });
  return { userId: entry.userId, token };
}

/**
 * CLI local-access bypass: when ADORABLE_CLI_LOCAL_ACCESS=true, allow
 * unauthenticated requests to /bridge/* from localhost to use the sole
 * active bridge connection's user identity. Makes the `figma-bridge` skill
 * (and other local CLIs) work with zero setup.
 */
async function tryCliLocalAccess(req: any): Promise<boolean> {
  if (process.env.ADORABLE_CLI_LOCAL_ACCESS !== 'true') return false;
  if (!req.path.startsWith('/bridge/')) return false;
  if (req.headers['authorization']) return false; // user provided a token — use it

  // Only trust loopback addresses
  const ip = (req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '');
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== 'localhost') return false;

  const userId = figmaBridge.getSoleConnectionUserId();
  if (!userId) return false;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return false;

  req.user = user;
  return true;
}

// All other routes require authentication (with CLI localhost bypass for /bridge/*)
router.use(async (req, res, next) => {
  if (await tryCliLocalAccess(req)) return next();
  return authenticate(req, res, next);
});

/**
 * Get Figma PAT from user settings
 */
async function getFigmaToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.settings) return null;

  try {
    const settings = JSON.parse(user.settings);
    const figmaProfile = settings.profiles?.find((p: any) => p.provider === 'figma');
    if (figmaProfile?.apiKey) {
      return decrypt(figmaProfile.apiKey);
    }
  } catch (e) {
    console.error('Failed to get Figma token:', e);
  }
  return null;
}

/**
 * Make authenticated request to Figma API
 */
async function figmaFetch(token: string, endpoint: string): Promise<any> {
  const response = await fetch(`${FIGMA_API_BASE}${endpoint}`, {
    headers: {
      'X-Figma-Token': token
    }
  });

  if (!response.ok) {
    const error = await response.text();

    // Handle rate limiting with helpful message
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? `${retryAfter} seconds` : '1-2 minutes';
      throw new Error(`Figma rate limit exceeded. Please wait ${waitTime} before trying again.`);
    }

    throw new Error(`Figma API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * GET /status - Check if Figma PAT is configured
 */
router.get('/status', async (req: any, res) => {
  try {
    const token = await getFigmaToken(req.user.id);

    if (!token) {
      return res.json({ configured: false });
    }

    // Verify token by fetching user info
    try {
      const user = await figmaFetch(token, '/me');
      res.json({
        configured: true,
        user: {
          id: user.id,
          handle: user.handle,
          email: user.email,
          img_url: user.img_url
        }
      });
    } catch (e) {
      // Token is invalid
      res.json({ configured: false, error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Figma status error:', error);
    res.status(500).json({ error: 'Failed to check Figma status' });
  }
});

/**
 * GET /files - List user's recent files
 * Note: Figma API doesn't have a direct "list all files" endpoint.
 * Users need to provide a file URL/key or we can list files from a team/project.
 */
router.get('/files', async (req: any, res) => {
  try {
    const token = await getFigmaToken(req.user.id);
    if (!token) {
      return res.status(401).json({ error: 'Figma not configured' });
    }

    // Get user's teams
    const user = await figmaFetch(token, '/me');

    // Note: To list files, we need team_id. Return user info for now.
    // Users will paste Figma file URLs directly.
    res.json({
      user,
      message: 'Paste a Figma file URL to import designs'
    });
  } catch (error: any) {
    console.error('Figma files error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch files' });
  }
});

/**
 * GET /files/:fileKey - Get file structure (pages and frames)
 */
router.get('/files/:fileKey', async (req: any, res) => {
  try {
    const token = await getFigmaToken(req.user.id);
    if (!token) {
      return res.status(401).json({ error: 'Figma not configured' });
    }

    const { fileKey } = req.params;
    const { depth } = req.query;

    // Fetch file with optional depth limit
    const endpoint = depth ? `/files/${fileKey}?depth=${depth}` : `/files/${fileKey}`;
    const file = await figmaFetch(token, endpoint);

    // Extract pages and their children (frames, components)
    const pages = file.document?.children?.map((page: any) => ({
      id: page.id,
      name: page.name,
      type: page.type,
      children: extractSelectableNodes(page.children || [])
    })) || [];

    res.json({
      name: file.name,
      lastModified: file.lastModified,
      thumbnailUrl: file.thumbnailUrl,
      pages
    });
  } catch (error: any) {
    console.error('Figma file error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch file' });
  }
});

/**
 * Extract nodes that can be selected for import (frames, components, etc.)
 */
function extractSelectableNodes(nodes: any[]): any[] {
  const selectableTypes = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'GROUP', 'SECTION', 'INSTANCE'];

  return nodes.map(node => {
    const result: any = {
      id: node.id,
      name: node.name,
      type: node.type
    };

    if (node.absoluteBoundingBox) {
      result.bounds = {
        width: Math.round(node.absoluteBoundingBox.width),
        height: Math.round(node.absoluteBoundingBox.height)
      };
    }

    // Recursively get children for containers
    if (node.children && selectableTypes.includes(node.type)) {
      const childNodes = extractSelectableNodes(node.children);
      if (childNodes.length > 0) {
        result.children = childNodes;
      }
    }

    return result;
  }).filter(node => selectableTypes.includes(node.type) || node.children?.length > 0);
}

/**
 * GET /files/:fileKey/nodes - Get specific node details
 */
router.get('/files/:fileKey/nodes', async (req: any, res) => {
  try {
    const token = await getFigmaToken(req.user.id);
    if (!token) {
      return res.status(401).json({ error: 'Figma not configured' });
    }

    const { fileKey } = req.params;
    const { ids } = req.query;

    if (!ids) {
      return res.status(400).json({ error: 'Node IDs required' });
    }

    const nodes = await figmaFetch(token, `/files/${fileKey}/nodes?ids=${ids}`);
    res.json(nodes);
  } catch (error: any) {
    console.error('Figma nodes error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch nodes' });
  }
});

/**
 * POST /import - Import selected nodes as JSON + images
 */
router.post('/import', async (req: any, res) => {
  try {
    const token = await getFigmaToken(req.user.id);
    if (!token) {
      return res.status(401).json({ error: 'Figma not configured' });
    }

    const { fileKey, nodeIds, scale = 2, format = 'png' } = req.body;

    if (!fileKey || !nodeIds || nodeIds.length === 0) {
      return res.status(400).json({ error: 'File key and node IDs required' });
    }

    // Fetch file info for name
    const fileInfo = await figmaFetch(token, `/files/${fileKey}?depth=1`);

    // Fetch detailed node information
    // URL encode node IDs since they contain colons (e.g., "1:2")
    const idsParam = nodeIds.map((id: string) => encodeURIComponent(id)).join(',');
    const nodesResponse = await figmaFetch(token, `/files/${fileKey}/nodes?ids=${idsParam}`);

    // Fetch images for selected nodes
    console.log('[Figma Import] Fetching images for nodes:', idsParam);
    console.log('[Figma Import] Original node IDs:', nodeIds);
    const imagesResponse = await figmaFetch(
      token,
      `/images/${fileKey}?ids=${idsParam}&scale=${scale}&format=${format}`
    );
    console.log('[Figma Import] Images response:', JSON.stringify(imagesResponse, null, 2));
    console.log('[Figma Import] Image keys returned:', imagesResponse.images ? Object.keys(imagesResponse.images) : 'none');

    // Check for Figma API error
    if (imagesResponse.err) {
      console.error('[Figma Import] Figma API returned error:', imagesResponse.err);
    }

    // Convert image URLs to base64 data URIs
    const imageDataUris: string[] = [];
    const selection: any[] = [];

    for (const nodeId of nodeIds) {
      // Try to find node data with original ID or URL-encoded variant
      const nodeData = nodesResponse.nodes[nodeId] || nodesResponse.nodes[encodeURIComponent(nodeId)];
      if (nodeData?.document) {
        selection.push({
          nodeId,
          nodeName: nodeData.document.name,
          nodeType: nodeData.document.type
        });
      }

      // Figma API may return keys with or without URL encoding - try both
      let imageUrl = imagesResponse.images?.[nodeId];
      if (!imageUrl) {
        // Try URL-encoded version
        imageUrl = imagesResponse.images?.[encodeURIComponent(nodeId)];
      }
      if (!imageUrl) {
        // Try decoded version (in case nodeId was encoded)
        imageUrl = imagesResponse.images?.[decodeURIComponent(nodeId)];
      }

      console.log(`[Figma Import] Node ${nodeId} image URL:`, imageUrl ? 'present' : 'missing');
      if (imageUrl) {
        try {
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) {
            console.error(`[Figma Import] Failed to fetch image: ${imageResponse.status}`);
            continue;
          }
          const arrayBuffer = await imageResponse.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          const mimeType = format === 'svg' ? 'image/svg+xml' : `image/${format}`;
          imageDataUris.push(`data:${mimeType};base64,${base64}`);
          console.log(`[Figma Import] Successfully converted image for node ${nodeId}, size: ${base64.length}`);
        } catch (e) {
          console.error(`Failed to fetch image for node ${nodeId}:`, e);
        }
      }
    }

    console.log(`[Figma Import] Total images converted: ${imageDataUris.length}`);

    res.json({
      fileKey,
      fileName: fileInfo.name,
      selection,
      jsonStructure: nodesResponse.nodes,
      imageDataUris
    });
  } catch (error: any) {
    console.error('Figma import error:', error);
    res.status(500).json({ error: error.message || 'Failed to import from Figma' });
  }
});

/**
 * GET /parse-url - Extract file key from Figma URL
 */
router.get('/parse-url', async (req: any, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }

  // Figma URL patterns:
  // https://www.figma.com/file/FILEKEY/FileName
  // https://www.figma.com/design/FILEKEY/FileName
  const match = (url as string).match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);

  if (!match) {
    return res.status(400).json({ error: 'Invalid Figma URL' });
  }

  res.json({ fileKey: match[2] });
});

// ============================================================
// Figma Live Bridge endpoints
// ============================================================

/**
 * POST /bridge/token - Generate a short-lived connection code for the Figma plugin
 */
router.post('/bridge/token', async (req: any, res) => {
  const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6-char hex
  pendingCodes.set(code, {
    userId: req.user.id,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min expiry
  });
  res.json({ code });
});

/**
 * GET /bridge/status - Check if Figma plugin is live-connected
 */
router.get('/bridge/status', async (req: any, res) => {
  const info = figmaBridge.getConnectionInfo(req.user.id);
  if (info) {
    res.json({ connected: true, fileKey: info.fileKey, fileName: info.fileName });
  } else {
    res.json({ connected: false });
  }
});

/**
 * POST /bridge/grab-selection - Get current Figma selection with images
 */
router.post('/bridge/grab-selection', async (req: any, res) => {
  const userId = req.user.id;

  if (!figmaBridge.isConnected(userId)) {
    return res.status(400).json({ error: 'Figma is not connected' });
  }

  try {
    // Get current selection with structure
    const selResult = await figmaBridge.sendCommand(userId, { action: 'get_selection' });

    if (!selResult.nodes || selResult.nodes.length === 0) {
      return res.status(400).json({ error: 'No frames selected in Figma' });
    }

    // Export each selected node as image
    const imageDataUris: string[] = [];
    for (const node of selResult.nodes) {
      try {
        const imgResult = await figmaBridge.sendCommand(userId, {
          action: 'export_node',
          nodeId: node.id,
          scale: 2,
        });
        if (imgResult.image) {
          imageDataUris.push(imgResult.image);
        }
      } catch (err) {
        console.error(`Failed to export Figma node ${node.id}:`, err);
      }
    }

    const connInfo = figmaBridge.getConnectionInfo(userId);

    res.json({
      fileKey: connInfo?.fileKey || 'live',
      fileName: connInfo?.fileName || 'Figma Live',
      selection: selResult.nodes.map((n: any) => ({
        nodeId: n.id,
        nodeName: n.name,
        nodeType: n.type,
      })),
      jsonStructure: selResult.jsonStructure || {},
      imageDataUris,
    });
  } catch (error: any) {
    console.error('Figma grab-selection error:', error);
    res.status(500).json({ error: error.message || 'Failed to grab Figma selection' });
  }
});

/**
 * POST /bridge/get-node - Get a Figma node's structure for design comparison
 */
router.post('/bridge/get-node', async (req: any, res) => {
  const userId = req.user.id;
  const { nodeId, includeImage } = req.body;

  if (!nodeId) {
    return res.status(400).json({ error: 'nodeId is required' });
  }

  if (!figmaBridge.isConnected(userId)) {
    return res.status(400).json({ error: 'Figma is not connected' });
  }

  try {
    const result = await figmaBridge.sendCommand(userId, { action: 'get_node', nodeId });
    res.json(result);
  } catch (error: any) {
    console.error('Figma get-node error:', error);
    res.status(500).json({ error: error.message || 'Failed to get Figma node' });
  }
});

/**
 * POST /bridge/get-variables - Extract Figma local variables (design tokens)
 */
router.post('/bridge/get-variables', async (req: any, res) => {
  const userId = req.user.id;

  if (!figmaBridge.isConnected(userId)) {
    return res.status(400).json({ error: 'Figma is not connected' });
  }

  try {
    const result = await figmaBridge.sendCommand(userId, { action: 'get_variables' });
    res.json(result);
  } catch (error: any) {
    console.error('Figma get-variables error:', error);
    res.status(500).json({ error: error.message || 'Failed to get Figma variables' });
  }
});

/**
 * POST /bridge/get-fonts - Get all fonts used in the live-connected Figma file
 */
router.post('/bridge/get-fonts', async (req: any, res) => {
  const userId = req.user.id;

  if (!figmaBridge.isConnected(userId)) {
    return res.status(400).json({ error: 'Figma is not connected' });
  }

  try {
    const result = await figmaBridge.sendCommand(userId, { action: 'get_fonts' });
    res.json(result);
  } catch (error: any) {
    console.error('Figma get-fonts error:', error);
    res.status(500).json({ error: error.message || 'Failed to get Figma fonts' });
  }
});

export const figmaRouter = router;
