/**
 * Kit Builder API Routes
 *
 * Provides endpoints for:
 * - Discovering components from Storybook
 * - CRUD operations on kits
 */

import express from 'express';
import { authenticate } from '../middleware/auth';
import { StorybookParser } from '../providers/kits/storybook-parser';
import { Kit, StorybookResource, StorybookComponent, KitTemplate } from '../providers/kits/types';
import { parseKitsFromSettings, updateKitsInSettings } from '../providers/kits/kit-registry';
import { prisma } from '../db/prisma';
import { generateKitTools, executeKitTool } from '../providers/kit-tools';
import { analyzeNpmPackage, validateStorybookComponents, fetchComponentMetadata, fetchAllComponentMetadata, discoverComponentsFromNpm } from '../providers/kits/npm-analyzer';

const router = express.Router();

router.use(authenticate);

/**
 * Discover components from a Storybook URL
 * POST /api/kits/discover
 */
router.post('/discover', async (req: any, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Storybook URL is required' });
  }

  // Validate URL
  try {
    const parsedUrl = new URL(url);

    // In production, require HTTPS
    if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'HTTPS is required in production' });
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
        return res.status(400).json({ error: 'Private network URLs are not allowed' });
      }
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    const parser = new StorybookParser(url);
    const components = await parser.discoverComponents();

    res.json({
      success: true,
      components,
      count: components.length
    });
  } catch (error) {
    console.error('Storybook discovery error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to discover components'
    });
  }
});

/**
 * Get component documentation
 * POST /api/kits/component-docs
 */
router.post('/component-docs', async (req: any, res) => {
  const { url, component } = req.body;

  if (!url || !component) {
    return res.status(400).json({ error: 'URL and component are required' });
  }

  try {
    const parser = new StorybookParser(url);
    const docs = await parser.getComponentDocumentation(component);

    res.json({
      success: true,
      documentation: docs
    });
  } catch (error) {
    console.error('Component docs error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get component documentation'
    });
  }
});

/**
 * Debug: Fetch raw Storybook HTML for a component
 * POST /api/kits/debug-storybook
 */
router.post('/debug-storybook', async (req: any, res) => {
  const { url, componentId } = req.body;

  if (!url || !componentId) {
    return res.status(400).json({ error: 'URL and componentId are required' });
  }

  try {
    // Try iframe URL first
    const iframeUrl = `${url.replace(/\/$/, '')}/iframe.html?viewMode=docs&id=${componentId}`;
    const docsUrl = `${url.replace(/\/$/, '')}/?path=/docs/${componentId}`;

    const iframeResponse = await fetch(iframeUrl, { headers: { 'Accept': 'text/html' } });
    const iframeHtml = iframeResponse.ok ? await iframeResponse.text() : null;

    // Extract code blocks for inspection
    const codeBlocks: string[] = [];
    if (iframeHtml) {
      const matches = iframeHtml.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/gi);
      for (const match of matches) {
        const content = match[1].substring(0, 200);
        if (content.trim()) {
          codeBlocks.push(content);
        }
      }
    }

    res.json({
      success: true,
      iframeUrl,
      docsUrl,
      htmlLength: iframeHtml?.length || 0,
      hasLxTags: iframeHtml?.includes('<lx-') || iframeHtml?.includes('lx-') || false,
      codeBlockCount: codeBlocks.length,
      sampleCodeBlocks: codeBlocks.slice(0, 5),
      // Sample of raw HTML around "example" or "usage"
      sampleHtml: iframeHtml?.substring(0, 2000) || ''
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch'
    });
  }
});

/**
 * Discover components from npm package (no Storybook needed)
 * POST /api/kits/discover-npm
 */
router.post('/discover-npm', async (req: any, res) => {
  const { packageName } = req.body;

  if (!packageName) {
    return res.status(400).json({ error: 'Package name is required' });
  }

  try {
    console.log(`[Kit Routes] Discovering components from npm: ${packageName}`);
    const result = await discoverComponentsFromNpm(packageName);

    if (result.errors.length > 0 && result.components.length === 0) {
      return res.status(400).json({
        success: false,
        error: result.errors.join(', ')
      });
    }

    res.json({
      success: true,
      packageName: result.packageName,
      version: result.version,
      components: result.components,
      count: result.components.length,
      errors: result.errors
    });
  } catch (error) {
    console.error('NPM discovery error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to discover components'
    });
  }
});

/**
 * Analyze npm package exports
 * POST /api/kits/analyze-npm
 */
router.post('/analyze-npm', async (req: any, res) => {
  const { packageName } = req.body;

  if (!packageName) {
    return res.status(400).json({ error: 'Package name is required' });
  }

  try {
    const result = await analyzeNpmPackage(packageName);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('NPM analysis error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to analyze npm package'
    });
  }
});

/**
 * Validate Storybook components against npm package
 * POST /api/kits/validate-components
 */
router.post('/validate-components', async (req: any, res) => {
  const { packageName, components, importSuffix } = req.body;

  if (!packageName || !components) {
    return res.status(400).json({ error: 'Package name and components are required' });
  }

  try {
    // Analyze the npm package
    const npmAnalysis = await analyzeNpmPackage(packageName);

    console.log(`[NPM Validation] Package: ${packageName}, Found ${npmAnalysis.exports.length} exports, Errors: ${npmAnalysis.errors.join(', ') || 'none'}`);
    if (npmAnalysis.exports.length > 0) {
      console.log(`[NPM Validation] Sample exports: ${npmAnalysis.exports.slice(0, 10).map(e => e.name).join(', ')}`);
    }

    if (npmAnalysis.errors.length > 0 && npmAnalysis.exports.length === 0) {
      return res.status(400).json({
        error: `Failed to analyze package: ${npmAnalysis.errors.join(', ')}`
      });
    }

    // Validate components
    const storybookComponents = components.map((c: any) => ({
      name: c.componentName || c.title?.split('/').pop() || c.name,
      id: c.id
    }));

    console.log(`[NPM Validation] Storybook components: ${storybookComponents.slice(0, 10).map((c: any) => c.name).join(', ')}`);

    const validation = validateStorybookComponents(
      storybookComponents,
      npmAnalysis.exports,
      importSuffix || 'Component'
    );

    res.json({
      success: true,
      packageName: npmAnalysis.packageName,
      version: npmAnalysis.version,
      totalExports: npmAnalysis.exports.length,
      allExports: npmAnalysis.exports.slice(0, 50), // Return some exports for debugging
      validation: {
        validCount: validation.valid.length,
        invalidCount: validation.invalid.length,
        valid: validation.valid,
        invalid: validation.invalid,
        unmatchedExports: validation.unmatchedExports.slice(0, 20)
      }
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to validate components'
    });
  }
});

/**
 * Fetch component metadata from npm package
 * POST /api/kits/component-metadata
 */
router.post('/component-metadata', async (req: any, res) => {
  const { packageName, componentName } = req.body;

  if (!packageName || !componentName) {
    return res.status(400).json({ error: 'Package name and component name are required' });
  }

  try {
    const metadata = await fetchComponentMetadata(packageName, componentName);

    if (metadata) {
      res.json({
        success: true,
        metadata
      });
    } else {
      res.json({
        success: false,
        error: 'Could not find component metadata'
      });
    }
  } catch (error) {
    console.error('Component metadata error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch component metadata'
    });
  }
});

/**
 * Fetch metadata for multiple components from npm package
 * POST /api/kits/batch-metadata
 */
router.post('/batch-metadata', async (req: any, res) => {
  const { packageName, componentNames } = req.body;

  if (!packageName || !componentNames || !Array.isArray(componentNames)) {
    return res.status(400).json({ error: 'Package name and component names array are required' });
  }

  try {
    const metadataMap = await fetchAllComponentMetadata(packageName, componentNames);

    res.json({
      success: true,
      metadata: Object.fromEntries(metadataMap),
      found: metadataMap.size,
      total: componentNames.length
    });
  } catch (error) {
    console.error('Batch metadata error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch component metadata'
    });
  }
});

/**
 * List all kits for the current user
 * GET /api/kits
 */
router.get('/', async (req: any, res) => {
  const user = req.user;

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    res.json({ kits });
  } catch (error) {
    console.error('List kits error:', error);
    res.status(500).json({ error: 'Failed to list kits' });
  }
});

/**
 * Get a specific kit
 * GET /api/kits/:id
 */
router.get('/:id', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    const kit = kits.find(k => k.id === id);

    if (!kit) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    res.json({ kit });
  } catch (error) {
    console.error('Get kit error:', error);
    res.status(500).json({ error: 'Failed to get kit' });
  }
});

/**
 * Create a new kit
 * POST /api/kits
 */
router.post('/', async (req: any, res) => {
  const user = req.user;
  const { name, description, template, npmPackage, importSuffix, storybookUrl, components, selectedComponentIds, mcpServerIds } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Kit name is required' });
  }

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);

    // Check for duplicate name
    if (kits.some(k => k.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'A kit with this name already exists' });
    }

    const now = new Date().toISOString();

    // Create Storybook resource if components provided (from npm discovery or Storybook)
    const resources: any[] = [];
    if (components && components.length > 0) {
      const storybookResource: StorybookResource = {
        id: crypto.randomUUID(),
        type: 'storybook',
        url: storybookUrl || '',  // URL is optional for npm-only discovery
        status: 'discovered',
        lastDiscovered: now,
        components: components as StorybookComponent[],
        selectedComponentIds: selectedComponentIds || components.map((c: any) => c.id)
      };
      resources.push(storybookResource);
    }

    // Default template if not provided
    const kitTemplate: KitTemplate = template || {
      type: 'default',
      files: {},  // Client-side will use BASE_FILES
      angularVersion: '21'
    };

    const newKit: Kit = {
      id: crypto.randomUUID(),
      name,
      description: description || undefined,
      template: kitTemplate,
      npmPackage: npmPackage || undefined,
      importSuffix: importSuffix || 'Component',
      resources,
      mcpServerIds: mcpServerIds || [],
      createdAt: now,
      updatedAt: now
    };

    kits.push(newKit);

    // Save to database
    const updatedSettings = updateKitsInSettings(settings, kits);
    await prisma.user.update({
      where: { id: user.id },
      data: { settings: JSON.stringify(updatedSettings) }
    });

    res.json({ success: true, kit: newKit });
  } catch (error) {
    console.error('Create kit error:', error);
    res.status(500).json({ error: 'Failed to create kit' });
  }
});

/**
 * Update a kit
 * PUT /api/kits/:id
 */
router.put('/:id', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;
  const { name, description, template, npmPackage, importSuffix, storybookUrl, components, selectedComponentIds, mcpServerIds } = req.body;

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    const kitIndex = kits.findIndex(k => k.id === id);

    if (kitIndex === -1) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    const existingKit = kits[kitIndex];
    const now = new Date().toISOString();

    // Build or update Storybook resource (components from npm discovery or Storybook)
    let resources = [...existingKit.resources];
    if (components && components.length > 0) {
      // Find existing Storybook resource or create new one
      const existingStorybookIndex = resources.findIndex(r => r.type === 'storybook');

      const storybookResource: StorybookResource = {
        id: existingStorybookIndex >= 0 ? (resources[existingStorybookIndex] as StorybookResource).id : crypto.randomUUID(),
        type: 'storybook',
        url: storybookUrl || (existingStorybookIndex >= 0 ? (resources[existingStorybookIndex] as StorybookResource).url : ''),
        status: 'discovered',
        lastDiscovered: now,
        components: components as StorybookComponent[],
        selectedComponentIds: selectedComponentIds || components.map((c: any) => c.id)
      };

      if (existingStorybookIndex >= 0) {
        resources[existingStorybookIndex] = storybookResource;
      } else {
        resources.push(storybookResource);
      }
    }

    // Update the kit
    const updatedKit: Kit = {
      ...existingKit,
      name: name || existingKit.name,
      description: description !== undefined ? description : existingKit.description,
      template: template || existingKit.template,
      npmPackage: npmPackage !== undefined ? npmPackage : existingKit.npmPackage,
      importSuffix: importSuffix !== undefined ? importSuffix : existingKit.importSuffix,
      resources,
      mcpServerIds: mcpServerIds || existingKit.mcpServerIds,
      updatedAt: now
    };

    kits[kitIndex] = updatedKit;

    // Save to database
    const updatedSettings = updateKitsInSettings(settings, kits);
    await prisma.user.update({
      where: { id: user.id },
      data: { settings: JSON.stringify(updatedSettings) }
    });

    res.json({ success: true, kit: updatedKit });
  } catch (error) {
    console.error('Update kit error:', error);
    res.status(500).json({ error: 'Failed to update kit' });
  }
});

/**
 * Delete a kit
 * DELETE /api/kits/:id
 */
router.delete('/:id', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    const kitIndex = kits.findIndex(k => k.id === id);

    if (kitIndex === -1) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    kits.splice(kitIndex, 1);

    // Save to database
    const updatedSettings = updateKitsInSettings(settings, kits);
    await prisma.user.update({
      where: { id: user.id },
      data: { settings: JSON.stringify(updatedSettings) }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete kit error:', error);
    res.status(500).json({ error: 'Failed to delete kit' });
  }
});

/**
 * Update selected components for a kit
 * PUT /api/kits/:id/components
 */
router.put('/:id/components', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;
  const { selectedComponentIds } = req.body;

  if (!selectedComponentIds || !Array.isArray(selectedComponentIds)) {
    return res.status(400).json({ error: 'selectedComponentIds array is required' });
  }

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    const kitIndex = kits.findIndex(k => k.id === id);

    if (kitIndex === -1) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    const kit = kits[kitIndex];

    // Find the Storybook resource
    const storybookIndex = kit.resources.findIndex(r => r.type === 'storybook');
    if (storybookIndex === -1) {
      return res.status(400).json({ error: 'Kit has no Storybook resource' });
    }

    // Update selected components
    (kit.resources[storybookIndex] as StorybookResource).selectedComponentIds = selectedComponentIds;
    kit.updatedAt = new Date().toISOString();

    kits[kitIndex] = kit;

    // Save to database
    const updatedSettings = updateKitsInSettings(settings, kits);
    await prisma.user.update({
      where: { id: user.id },
      data: { settings: JSON.stringify(updatedSettings) }
    });

    res.json({ success: true, kit });
  } catch (error) {
    console.error('Update components error:', error);
    res.status(500).json({ error: 'Failed to update components' });
  }
});

/**
 * Re-discover components for a kit's Storybook
 * POST /api/kits/:id/rediscover
 */
router.post('/:id/rediscover', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    const kitIndex = kits.findIndex(k => k.id === id);

    if (kitIndex === -1) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    const kit = kits[kitIndex];

    // Find the Storybook resource
    const storybookIndex = kit.resources.findIndex(r => r.type === 'storybook');
    if (storybookIndex === -1) {
      return res.status(400).json({ error: 'Kit has no Storybook resource' });
    }

    const storybookResource = kit.resources[storybookIndex] as StorybookResource;

    // Re-discover components
    const parser = new StorybookParser(storybookResource.url);
    const components = await parser.discoverComponents();

    // Preserve previously selected components that still exist
    const existingIds = new Set(components.map(c => c.id));
    const preservedSelections = storybookResource.selectedComponentIds.filter(
      id => existingIds.has(id)
    );

    // Update the resource
    storybookResource.components = components;
    storybookResource.selectedComponentIds = preservedSelections.length > 0
      ? preservedSelections
      : components.map(c => c.id);
    storybookResource.lastDiscovered = new Date().toISOString();
    storybookResource.status = 'discovered';
    storybookResource.error = undefined;

    kit.resources[storybookIndex] = storybookResource;
    kit.updatedAt = new Date().toISOString();
    kits[kitIndex] = kit;

    // Save to database
    const updatedSettings = updateKitsInSettings(settings, kits);
    await prisma.user.update({
      where: { id: user.id },
      data: { settings: JSON.stringify(updatedSettings) }
    });

    res.json({
      success: true,
      kit,
      newCount: components.length,
      preservedSelections: preservedSelections.length
    });
  } catch (error) {
    console.error('Rediscover error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to rediscover components'
    });
  }
});

/**
 * Preview kit tool output - test what the AI would see
 * POST /api/kits/:id/preview-tool
 */
router.post('/:id/preview-tool', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;
  const { tool, args } = req.body;

  if (!tool) {
    return res.status(400).json({ error: 'Tool name is required (list_components, get_component, get_design_tokens)' });
  }

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    const kit = kits.find(k => k.id === id);

    if (!kit) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    // Generate the tool definitions
    const tools = generateKitTools(kit);
    if (tools.length === 0) {
      return res.status(400).json({
        error: 'Kit has no tools available. Make sure it has discovered components with some selected.'
      });
    }

    // Find the matching tool
    const toolPrefix = kit.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20);
    const fullToolName = `${toolPrefix}_${tool}`;

    const matchingTool = tools.find(t => t.name === fullToolName);
    if (!matchingTool) {
      return res.status(400).json({
        error: `Tool '${tool}' not found. Available tools: ${tools.map(t => t.name.replace(`${toolPrefix}_`, '')).join(', ')}`
      });
    }

    // Execute the tool
    const result = await executeKitTool(fullToolName, args || {}, kit);

    res.json({
      success: true,
      tool: fullToolName,
      toolDefinition: matchingTool,
      args: args || {},
      output: result.content,
      isError: result.isError
    });
  } catch (error) {
    console.error('Preview tool error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to preview tool output'
    });
  }
});

/**
 * List available tools for a kit
 * GET /api/kits/:id/tools
 */
router.get('/:id/tools', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    const kit = kits.find(k => k.id === id);

    if (!kit) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    const tools = generateKitTools(kit);

    res.json({
      success: true,
      kitName: kit.name,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema.properties
      }))
    });
  } catch (error) {
    console.error('List tools error:', error);
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

export const kitRouter = router;
