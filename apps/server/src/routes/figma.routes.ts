import express from 'express';
import { authenticate } from '../middleware/auth';
import { decrypt } from '../utils/crypto';
import { prisma } from '../db/prisma';

const router = express.Router();
const FIGMA_API_BASE = 'https://api.figma.com/v1';

router.use(authenticate);

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

export const figmaRouter = router;
