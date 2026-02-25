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
import { generateComponentCatalog, generateComponentDocFiles } from '../providers/kits/doc-generator';
import { analyzeNpmPackage, validateStorybookComponents, fetchComponentMetadata, fetchAllComponentMetadata, discoverComponentsFromNpm } from '../providers/kits/npm-analyzer';
import { SYSTEM_PROMPT } from '../providers/base';
import { kitFsService } from '../services/kit-fs.service';

const router = express.Router();

router.use(authenticate);

/**
 * Get the default system prompt
 * GET /api/kits/default-system-prompt
 */
router.get('/default-system-prompt', async (_req: any, res) => {
  res.json({ prompt: SYSTEM_PROMPT });
});

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

    // If template files are stored on disk, load them back into the response
    let kitResponse = kit;
    if (kit.template?.storedOnDisk) {
      try {
        const templateFiles = await kitFsService.readKitTemplateFiles(id);
        kitResponse = { ...kit, template: { ...kit.template, files: templateFiles } };
      } catch (err) {
        console.warn(`[Kit] Could not read template files from disk for kit ${id}:`, err);
      }
    }

    res.json({ kit: kitResponse });
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
  const { name, description, template, npmPackage, importSuffix, npmPackages, storybookUrl, components, selectedComponentIds, mcpServerIds, systemPrompt, baseSystemPrompt } = req.body;

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
      npmPackages: npmPackages || undefined,
      resources,
      systemPrompt: systemPrompt || undefined,
      baseSystemPrompt: baseSystemPrompt || undefined,
      mcpServerIds: mcpServerIds || [],
      createdAt: now,
      updatedAt: now
    };

    // Store template files on disk if template has files
    const templateFilesToReturn = newKit.template.files;
    if (newKit.template.files && Object.keys(newKit.template.files).length > 0) {
      // Extract .adorable files from template and write to .adorable dir
      const adorableFromTemplate = kitFsService.extractAdorableFilesFromTemplate(newKit.template.files);
      if (Object.keys(adorableFromTemplate).length > 0) {
        await kitFsService.writeKitAdorableFiles(newKit.id, adorableFromTemplate);
      }

      // Write template files to disk (without .adorable)
      const templateWithoutAdorable = kitFsService.removeAdorableFromTemplate(newKit.template.files);
      if (Object.keys(templateWithoutAdorable).length > 0) {
        await kitFsService.writeKitTemplateFiles(newKit.id, templateWithoutAdorable);
      }

      // Clear files from DB and set flag
      newKit.template = { ...newKit.template, files: {}, storedOnDisk: true };
    }

    kits.push(newKit);

    // Save to database
    const updatedSettings = updateKitsInSettings(settings, kits);
    await prisma.user.update({
      where: { id: user.id },
      data: { settings: JSON.stringify(updatedSettings) }
    });

    // Generate and persist .adorable doc files on disk
    const docFiles = generateComponentDocFiles(newKit);
    if (Object.keys(docFiles).length > 0) {
      kitFsService.writeKitAdorableFiles(newKit.id, docFiles).catch(err =>
        console.error(`[Kit] Failed to write .adorable files for kit "${newKit.name}":`, err)
      );
    }

    // Return kit with template files for the client
    const kitResponse = { ...newKit, template: { ...newKit.template, files: templateFilesToReturn } };
    res.json({ success: true, kit: kitResponse });
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
  const { name, description, template, npmPackage, importSuffix, npmPackages, storybookUrl, components, selectedComponentIds, mcpServerIds, systemPrompt, baseSystemPrompt } = req.body;

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
    if (components !== undefined) {
      const existingStorybookIndex = resources.findIndex(r => r.type === 'storybook');

      if (components && components.length > 0) {
        // Create or update Storybook resource with components
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
      } else if (existingStorybookIndex >= 0) {
        // Components array is empty — remove the storybook resource
        resources.splice(existingStorybookIndex, 1);
      }
    }

    // Determine the effective template
    let effectiveTemplate = template || existingKit.template;
    let templateFilesToReturn = effectiveTemplate.files;

    // If template has files, store them on disk
    if (template && template.files && Object.keys(template.files).length > 0) {
      // Extract .adorable files from template and write to .adorable dir
      const adorableFromTemplate = kitFsService.extractAdorableFilesFromTemplate(template.files);
      if (Object.keys(adorableFromTemplate).length > 0) {
        await kitFsService.writeKitAdorableFiles(id, adorableFromTemplate);
      }

      // Write template files to disk (without .adorable)
      const templateWithoutAdorable = kitFsService.removeAdorableFromTemplate(template.files);
      if (Object.keys(templateWithoutAdorable).length > 0) {
        await kitFsService.writeKitTemplateFiles(id, templateWithoutAdorable);
      }

      templateFilesToReturn = template.files;
      // Clear files from DB and set flag
      effectiveTemplate = { ...template, files: {}, storedOnDisk: true };
    }

    // Update the kit (null clears a field, undefined preserves it)
    const updatedKit: Kit = {
      ...existingKit,
      name: name || existingKit.name,
      description: description !== undefined ? description : existingKit.description,
      template: effectiveTemplate,
      npmPackage: npmPackage !== undefined ? (npmPackage || undefined) : existingKit.npmPackage,
      importSuffix: importSuffix !== undefined ? importSuffix : existingKit.importSuffix,
      npmPackages: npmPackages !== undefined ? (Array.isArray(npmPackages) && npmPackages.length > 0 ? npmPackages : undefined) : existingKit.npmPackages,
      resources,
      systemPrompt: systemPrompt !== undefined ? systemPrompt : existingKit.systemPrompt,
      baseSystemPrompt: baseSystemPrompt !== undefined ? baseSystemPrompt : existingKit.baseSystemPrompt,
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

    // Regenerate .adorable files if components changed (preserves user edits)
    if (components !== undefined) {
      const docFiles = generateComponentDocFiles(updatedKit);
      if (Object.keys(docFiles).length > 0) {
        kitFsService.regenerateAdorableFiles(updatedKit.id, docFiles).catch(err =>
          console.error(`[Kit] Failed to regenerate .adorable files for kit "${updatedKit.name}":`, err)
        );
      }
    }

    // Return kit with template files for the client
    const kitResponse = { ...updatedKit, template: { ...updatedKit.template, files: templateFilesToReturn } };
    res.json({ success: true, kit: kitResponse });
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

    // Clean up .adorable files from disk
    kitFsService.deleteKitFiles(id).catch(err =>
      console.error(`[Kit] Failed to delete kit files for ${id}:`, err)
    );

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

    // Regenerate .adorable files for the updated selection (preserves user edits)
    const docFiles = generateComponentDocFiles(kit);
    if (Object.keys(docFiles).length > 0) {
      kitFsService.regenerateAdorableFiles(kit.id, docFiles).catch(err =>
        console.error(`[Kit] Failed to regenerate .adorable files for kit "${kit.name}":`, err)
      );
    }

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

    // Re-discover components — use npm discovery if kit has npm packages and no Storybook URL
    let components: StorybookComponent[];
    const hasNpmPackages = (kit.npmPackages && kit.npmPackages.length > 0) || kit.npmPackage;
    const hasStorybookUrl = storybookResource.url && storybookResource.url.startsWith('http');

    if (hasNpmPackages && !hasStorybookUrl) {
      // NPM-based rediscovery
      const packages = kit.npmPackages || (kit.npmPackage ? [{ name: kit.npmPackage, importSuffix: kit.importSuffix ?? 'Component' }] : []);
      const allComponents: StorybookComponent[] = [];
      for (const pkg of packages) {
        const result = await discoverComponentsFromNpm(pkg.name);
        for (const comp of result.components) {
          allComponents.push({
            id: comp.id,
            title: `${comp.category}/${comp.componentName}`,
            name: 'Docs',
            type: 'docs',
            componentName: comp.componentName,
            category: comp.category,
            selector: comp.selector,
            usageType: comp.usageType,
            description: comp.description,
            inputs: comp.inputs,
            outputs: comp.outputs,
            template: comp.template,
            examples: comp.examples,
            sourcePackage: pkg.name,
            secondaryEntryPoint: comp.secondaryEntryPoint,
          });
        }
      }
      components = allComponents;
    } else {
      // Storybook URL-based rediscovery
      const parser = new StorybookParser(storybookResource.url);
      components = await parser.discoverComponents();
    }

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

    // Regenerate .adorable files (preserves user edits, removes stale docs)
    const docFiles = generateComponentDocFiles(kit);
    if (Object.keys(docFiles).length > 0) {
      kitFsService.regenerateAdorableFiles(kit.id, docFiles).catch(err =>
        console.error(`[Kit] Failed to regenerate .adorable files for kit "${kit.name}":`, err)
      );
    }

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
 * Preview component catalog and doc files - test what the AI would see
 * POST /api/kits/:id/preview-docs
 */
router.post('/:id/preview-docs', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;
  const { componentName } = req.body;

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    const kit = kits.find(k => k.id === id);

    if (!kit) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    const catalog = generateComponentCatalog(kit);
    if (!catalog) {
      return res.status(400).json({
        error: 'Kit has no catalog. Make sure it has discovered components with some selected.'
      });
    }

    const docFiles = generateComponentDocFiles(kit);

    // If a specific component is requested, return just that doc
    if (componentName) {
      const docPath = `.adorable/components/${componentName}.md`;
      const doc = docFiles[docPath];
      if (!doc) {
        return res.status(404).json({
          error: `Component doc not found for "${componentName}". Available: ${Object.keys(docFiles).filter(p => p.endsWith('.md') && !p.includes('README') && !p.includes('design-tokens')).map(p => p.replace('.adorable/components/', '').replace('.md', '')).join(', ')}`
        });
      }
      return res.json({ success: true, catalog, componentDoc: doc });
    }

    res.json({
      success: true,
      catalog,
      catalogLength: catalog.length,
      docFileCount: Object.keys(docFiles).length,
      docFiles: Object.fromEntries(
        Object.entries(docFiles).map(([path, content]) => [path, { length: content.length, preview: content.slice(0, 200) }])
      )
    });
  } catch (error) {
    console.error('Preview docs error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to preview docs'
    });
  }
});

/**
 * Preview the component catalog for a kit
 * GET /api/kits/:id/catalog
 */
router.get('/:id/catalog', async (req: any, res) => {
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

    const catalog = generateComponentCatalog(kit);

    res.json({
      success: true,
      kitName: kit.name,
      catalog,
      catalogLength: catalog.length
    });
  } catch (error) {
    console.error('Catalog error:', error);
    res.status(500).json({ error: 'Failed to generate catalog' });
  }
});

/**
 * List all .adorable files for a kit
 * GET /api/kits/:id/adorable-files
 */
router.get('/:id/adorable-files', async (req: any, res) => {
  const { id } = req.params;

  try {
    const files = await kitFsService.listFiles(id);
    res.json({ success: true, files });
  } catch (error) {
    console.error('List adorable files error:', error);
    res.status(500).json({ error: 'Failed to list adorable files' });
  }
});

/**
 * Read a specific .adorable file for a kit
 * GET /api/kits/:id/adorable-files/*
 */
router.get('/:id/adorable-files/*', async (req: any, res) => {
  const { id } = req.params;
  const filePath = req.params[0]; // everything after adorable-files/

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  try {
    const content = await kitFsService.readFile(id, `.adorable/${filePath}`);
    res.json({ success: true, path: `.adorable/${filePath}`, content });
  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

/**
 * Update a specific .adorable file for a kit
 * PUT /api/kits/:id/adorable-files/*
 */
router.put('/:id/adorable-files/*', async (req: any, res) => {
  const { id } = req.params;
  const filePath = req.params[0];
  const { content } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required in body' });
  }

  try {
    await kitFsService.writeFile(id, `.adorable/${filePath}`, content);
    res.json({ success: true, path: `.adorable/${filePath}` });
  } catch (error) {
    console.error('Write adorable file error:', error);
    res.status(500).json({ error: 'Failed to write file' });
  }
});

/**
 * List ALL files across the kit directory (both .adorable and template)
 * GET /api/kits/:id/files
 */
router.get('/:id/files', async (req: any, res) => {
  const { id } = req.params;

  try {
    const files = await kitFsService.listAllKitFiles(id);
    res.json({ success: true, files });
  } catch (error) {
    console.error('List kit files error:', error);
    res.status(500).json({ error: 'Failed to list kit files' });
  }
});

/**
 * Read a specific file from a kit's directory
 * GET /api/kits/:id/files/*
 */
router.get('/:id/files/*', async (req: any, res) => {
  const { id } = req.params;
  const filePath = req.params[0];

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  try {
    const content = await kitFsService.readFile(id, filePath);
    res.json({ success: true, path: filePath, content });
  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

/**
 * Update/create a specific file in a kit's directory
 * PUT /api/kits/:id/files/*
 */
router.put('/:id/files/*', async (req: any, res) => {
  const { id } = req.params;
  const filePath = req.params[0];
  const { content } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required in body' });
  }

  try {
    await kitFsService.writeFile(id, filePath, content);
    res.json({ success: true, path: filePath });
  } catch (error) {
    console.error('Write kit file error:', error);
    res.status(500).json({ error: 'Failed to write file' });
  }
});

/**
 * Delete a specific file from a kit's directory
 * DELETE /api/kits/:id/files/*
 */
router.delete('/:id/files/*', async (req: any, res) => {
  const { id } = req.params;
  const filePath = req.params[0];

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  try {
    await kitFsService.deleteFile(id, filePath);
    res.json({ success: true, path: filePath });
  } catch (error) {
    console.error('Delete kit file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * Upload multiple files to a kit's directory
 * POST /api/kits/:id/upload-files
 */
router.post('/:id/upload-files', async (req: any, res) => {
  const { id } = req.params;
  const { files } = req.body;

  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'files array is required' });
  }

  try {
    for (const file of files) {
      if (!file.path || typeof file.content !== 'string') continue;
      await kitFsService.writeFile(id, file.path, file.content);
    }
    res.json({ success: true, count: files.length });
  } catch (error) {
    console.error('Upload kit files error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

/**
 * Force-regenerate all .adorable docs for a kit
 * POST /api/kits/:id/regenerate-docs
 */
router.post('/:id/regenerate-docs', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;
  const { overwrite } = req.body; // if true, discard user edits

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    const kit = kits.find(k => k.id === id);

    if (!kit) {
      return res.status(404).json({ error: 'Kit not found' });
    }

    const docFiles = generateComponentDocFiles(kit);
    if (Object.keys(docFiles).length === 0) {
      return res.status(400).json({ error: 'Kit has no components to generate docs for' });
    }

    if (overwrite) {
      // Full overwrite — discard user edits
      await kitFsService.writeKitAdorableFiles(id, docFiles);
    } else {
      // Smart merge — preserve user edits
      await kitFsService.regenerateAdorableFiles(id, docFiles);
    }

    const files = await kitFsService.listFiles(id);
    res.json({ success: true, fileCount: files.length, files });
  } catch (error) {
    console.error('Regenerate docs error:', error);
    res.status(500).json({ error: 'Failed to regenerate docs' });
  }
});

/**
 * Export a complete kit (metadata + template files + .adorable docs)
 * POST /api/kits/:id/export
 */
router.post('/:id/export', async (req: any, res) => {
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

    // Load template files from disk if stored there
    let templateFiles = kit.template?.files || {};
    if (kit.template?.storedOnDisk) {
      try {
        templateFiles = await kitFsService.readKitTemplateFiles(id);
      } catch (err) {
        console.warn(`[Kit Export] Could not read template files from disk for kit ${id}:`, err);
      }
    }

    // Load .adorable files from disk
    let adorableFiles: Record<string, string> = {};
    try {
      adorableFiles = await kitFsService.readKitAdorableFiles(id);
    } catch (err) {
      // No .adorable files — that's fine
    }

    res.json({
      name: kit.name,
      description: kit.description,
      template: { ...kit.template, files: templateFiles, storedOnDisk: false },
      npmPackage: kit.npmPackage,
      importSuffix: kit.importSuffix,
      npmPackages: kit.npmPackages,
      resources: kit.resources,
      systemPrompt: kit.systemPrompt,
      baseSystemPrompt: kit.baseSystemPrompt,
      mcpServerIds: kit.mcpServerIds,
      adorableFiles,
    });
  } catch (error) {
    console.error('Export kit error:', error);
    res.status(500).json({ error: 'Failed to export kit' });
  }
});

/**
 * Import a complete kit from exported data
 * POST /api/kits/import
 */
router.post('/import', async (req: any, res) => {
  const user = req.user;
  const { name, description, template, npmPackage, importSuffix, npmPackages, resources, systemPrompt, baseSystemPrompt, mcpServerIds, adorableFiles } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Kit name is required' });
  }

  try {
    const settings = typeof user.settings === 'string'
      ? JSON.parse(user.settings || '{}')
      : (user.settings || {});

    const kits = parseKitsFromSettings(settings);
    const now = new Date().toISOString();

    // Generate a new unique name if there's a conflict
    let kitName = name;
    let suffix = 1;
    while (kits.some(k => k.name.toLowerCase() === kitName.toLowerCase())) {
      kitName = `${name} (${suffix})`;
      suffix++;
    }

    const newKit: Kit = {
      id: crypto.randomUUID(),
      name: kitName,
      description: description || undefined,
      template: template || { type: 'default', files: {}, angularVersion: '21' },
      npmPackage: npmPackage || undefined,
      importSuffix: importSuffix || 'Component',
      npmPackages: npmPackages || undefined,
      resources: resources || [],
      systemPrompt: systemPrompt || undefined,
      baseSystemPrompt: baseSystemPrompt || undefined,
      mcpServerIds: mcpServerIds || [],
      createdAt: now,
      updatedAt: now,
    };

    // Store template files on disk if template has files
    if (newKit.template.files && Object.keys(newKit.template.files).length > 0) {
      const adorableFromTemplate = kitFsService.extractAdorableFilesFromTemplate(newKit.template.files);
      if (Object.keys(adorableFromTemplate).length > 0) {
        await kitFsService.writeKitAdorableFiles(newKit.id, adorableFromTemplate);
      }

      const templateWithoutAdorable = kitFsService.removeAdorableFromTemplate(newKit.template.files);
      if (Object.keys(templateWithoutAdorable).length > 0) {
        await kitFsService.writeKitTemplateFiles(newKit.id, templateWithoutAdorable);
      }

      newKit.template = { ...newKit.template, files: {}, storedOnDisk: true };
    }

    // Write .adorable files from export data
    if (adorableFiles && Object.keys(adorableFiles).length > 0) {
      await kitFsService.writeKitAdorableFiles(newKit.id, adorableFiles);
    }

    kits.push(newKit);

    // Save to database
    const updatedSettings = updateKitsInSettings(settings, kits);
    await prisma.user.update({
      where: { id: user.id },
      data: { settings: JSON.stringify(updatedSettings) },
    });

    res.json({ success: true, kit: newKit });
  } catch (error) {
    console.error('Import kit error:', error);
    res.status(500).json({ error: 'Failed to import kit' });
  }
});

export const kitRouter = router;
