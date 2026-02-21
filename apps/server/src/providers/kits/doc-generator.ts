/**
 * Kit Documentation Generator
 *
 * Generates a compact component catalog (for injection into the user message)
 * and per-component `.adorable/components/{Name}.md` files (for on-demand read_files).
 * This replaces the dynamic kit tools approach to avoid context explosion and wasted turns.
 */

import { Kit, StorybookResource, StorybookComponent, NpmPackageConfig } from './types';

// ---------------------------------------------------------------------------
// Helpers (moved from kit-tools.ts)
// ---------------------------------------------------------------------------

function getKitPackages(kit: Kit): NpmPackageConfig[] {
  if (kit.npmPackages && kit.npmPackages.length > 0) {
    return kit.npmPackages;
  }
  if (kit.npmPackage) {
    return [{ name: kit.npmPackage, importSuffix: kit.importSuffix ?? 'Component' }];
  }
  return [];
}

function getComponentPackage(component: StorybookComponent, kit: Kit): NpmPackageConfig | undefined {
  const packages = getKitPackages(kit);
  if (packages.length === 0) return undefined;
  if (component.sourcePackage) {
    const match = packages.find(p => p.name === component.sourcePackage);
    if (match) return match;
  }
  return packages[0];
}

function getExportName(name: string, suffix: string | undefined): string {
  if (name.endsWith('Component') || name.endsWith('Directive') || name.endsWith('Module')) {
    return name;
  }
  const actualSuffix = suffix ?? 'Component';
  return actualSuffix ? `${name}${actualSuffix}` : name;
}

function getExampleValue(inputName: string, inputType: string): string {
  const name = inputName.toLowerCase();
  if (name.includes('content') || name.includes('text') || name.includes('label')) return 'Your text';
  if (name.includes('title')) return 'Title';
  if (name.includes('name')) return 'name';
  if (name.includes('url') || name.includes('href') || name.includes('src')) return 'https://example.com';
  if (name.includes('icon')) return 'icon-name';
  if (name.includes('color')) return 'primary';
  if (name.includes('size')) return 'medium';
  if (name.includes('type') || name.includes('variant')) return 'default';
  if (name.includes('disabled') || name.includes('readonly') || name.includes('loading')) return 'false';
  if (name.includes('visible') || name.includes('show') || name.includes('open') || name.includes('active')) return 'true';
  if (name.includes('count') || name.includes('index') || name.includes('limit')) return '0';
  if (inputType?.includes('string')) return 'value';
  if (inputType?.includes('number')) return '0';
  if (inputType?.includes('boolean')) return 'true';
  return 'value';
}

/**
 * Infer a sensible host element for directive usage examples.
 * If the selector has an element prefix (e.g., "button[fd-button]"), use that element.
 * For pure attribute selectors (e.g., "[fd-form-item]"), infer from the attribute name.
 */
function inferHostElement(selector: string | undefined, name: string): string {
  if (!selector) return 'div';

  // If selector has element prefix like "button[fd-button]" → use that element
  const elementPrefix = selector.split('[')[0];
  if (elementPrefix) {
    return elementPrefix;
  }

  // Pure attribute selector — infer from the attribute name
  const attrMatch = selector.match(/\[([^\]]+)\]/);
  const attr = (attrMatch ? attrMatch[1] : name).toLowerCase();

  if (attr.includes('button') || attr.includes('btn')) return 'button';
  if (attr.includes('label')) return 'label';
  if (attr.includes('input')) return 'input';
  if (attr.includes('link') || attr.includes('anchor')) return 'a';
  if (attr.includes('header')) return 'header';
  if (attr.includes('nav')) return 'nav';
  if (attr.includes('list')) return 'ul';
  if (attr.includes('img') || attr.includes('image')) return 'img';
  if (attr.includes('form')) return 'form';
  if (attr.includes('table')) return 'table';
  if (attr.includes('textarea')) return 'textarea';
  if (attr.includes('select')) return 'select';

  return 'div';
}

/**
 * Get the content text for a directive usage example.
 * Buttons get "Click me", void elements get nothing, everything else gets "Content".
 */
function getDirectiveContent(hostElement: string): string {
  const voidElements = ['input', 'img', 'br', 'hr'];
  if (voidElements.includes(hostElement)) return '';
  if (hostElement === 'button' || hostElement === 'a') return 'Click me';
  return 'Content';
}

/**
 * Get the import path for a component, preferring secondaryEntryPoint.
 */
function getImportPath(component: StorybookComponent, pkg: NpmPackageConfig | undefined): string | undefined {
  if (component.secondaryEntryPoint) return component.secondaryEntryPoint;
  if (pkg) return pkg.name;
  return undefined;
}

/**
 * Get a compact type label + selector summary for the catalog line.
 */
function getCompactTypeLabel(component: StorybookComponent): string {
  const selector = component.selector;
  if (!selector) {
    return '';
  }
  // Attribute selector like [lxButton] → directive
  if (selector.startsWith('[') && selector.endsWith(']')) {
    return `[${selector.slice(1, -1)}] directive`;
  }
  // Compound selector with attribute part
  if (selector.includes('[')) {
    const attrMatch = selector.match(/\[([^\]]+)\]/);
    if (attrMatch) return `[${attrMatch[1]}] directive`;
  }
  // Element selector like lx-button → component
  return `<${selector}>`;
}

// ---------------------------------------------------------------------------
// Catalog generation (compact, injected into user message)
// ---------------------------------------------------------------------------

/**
 * Generate a compact text catalog of all selected components in a kit.
 * ~15-30 tokens per component. Groups by category.
 */
export function generateComponentCatalog(kit: Kit): string {
  const storybookResource = kit.resources.find(
    (r): r is StorybookResource => r.type === 'storybook'
  );
  if (!storybookResource || storybookResource.status !== 'discovered') {
    return '';
  }

  const selectedComponents = storybookResource.components.filter(
    c => storybookResource.selectedComponentIds.includes(c.id)
  );
  if (selectedComponents.length === 0) {
    return '';
  }

  const packages = getKitPackages(kit);

  let result = '';

  // Package info
  if (packages.length === 1) {
    result += `Package: \`${packages[0].name}\`\n`;
  } else if (packages.length > 1) {
    result += `Packages: ${packages.map(p => `\`${p.name}\``).join(', ')}\n`;
  }
  result += '\n';

  // Group by category
  const byCategory = new Map<string, StorybookComponent[]>();
  for (const comp of selectedComponents) {
    const cat = comp.category || 'Other';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(comp);
  }

  const defaultPkg = packages.length > 0 ? packages[0].name : undefined;

  for (const [cat, comps] of byCategory) {
    const entries = comps.map(c => {
      const fullName = c.componentName || c.title || c.name || 'Unknown';
      const displayName = fullName.replace(/(?:Component|Directive)$/, '');
      const typeLabel = getCompactTypeLabel(c);
      let entry = typeLabel ? `${displayName} ${typeLabel}` : displayName;

      // Add import path if it differs from the root package (i.e., secondary entry point)
      const importPath = c.secondaryEntryPoint;
      if (importPath && importPath !== defaultPkg) {
        entry += ` — from '${importPath}'`;
      }
      return entry;
    });
    result += `**${cat}:** ${entries.join(', ')}\n`;
  }

  return result.trimEnd();
}

// ---------------------------------------------------------------------------
// Doc file generation (written to .adorable/components/ in MemoryFileSystem)
// ---------------------------------------------------------------------------

/**
 * Generate a map of { filePath: markdownContent } for all selected components,
 * plus a README and optional design-tokens file.
 */
export function generateComponentDocFiles(kit: Kit): Record<string, string> {
  const files: Record<string, string> = {};

  const storybookResource = kit.resources.find(
    (r): r is StorybookResource => r.type === 'storybook'
  );
  if (!storybookResource || storybookResource.status !== 'discovered') {
    return files;
  }

  const selectedComponents = storybookResource.components.filter(
    c => storybookResource.selectedComponentIds.includes(c.id)
  );
  if (selectedComponents.length === 0) {
    return files;
  }

  const packages = getKitPackages(kit);

  // README
  const componentNames = selectedComponents.map(c => c.componentName || c.title || c.name || 'Unknown');
  let readme = `# ${kit.name} Component Library\n\n`;
  if (packages.length === 1) {
    readme += `Package: \`${packages[0].name}\`\n\n`;
  } else if (packages.length > 1) {
    readme += `Packages: ${packages.map(p => `\`${p.name}\``).join(', ')}\n\n`;
  }
  readme += `## Available Components (${selectedComponents.length})\n\n`;
  readme += componentNames.map(n => `- [${n}](./${n}.md)`).join('\n') + '\n';
  files['.adorable/components/README.md'] = readme;

  // Individual component docs
  for (const comp of selectedComponents) {
    const name = comp.componentName || comp.title || comp.name || 'Unknown';
    const pkg = getComponentPackage(comp, kit);
    const doc = formatComponentDoc(comp, name, pkg, storybookResource.url);
    files[`.adorable/components/${name}.md`] = doc;
  }

  // Design tokens
  if (kit.designTokens) {
    const tokensDoc = formatDesignTokensDoc(kit.name, kit.designTokens);
    if (tokensDoc) {
      files['.adorable/design-tokens.md'] = tokensDoc;
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Per-component markdown formatting
// ---------------------------------------------------------------------------

function formatComponentDoc(
  component: StorybookComponent,
  name: string,
  pkg: NpmPackageConfig | undefined,
  storybookUrl?: string
): string {
  let md = `# ${name}\n\n`;

  // Type + selector + basic usage
  const requiredInputs = component.inputs?.filter(i => i.required) || [];
  const requiredAttrs = requiredInputs.map(i => `[${i.name}]="${getExampleValue(i.name, i.type)}"`).join(' ');

  if (component.usageType === 'directive' || component.selector?.includes('[')) {
    const attrMatch = component.selector?.match(/\[([^\]]+)\]/);
    const attrName = attrMatch ? attrMatch[1] : name.replace(/Component$|Directive$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const hostElement = inferHostElement(component.selector, name);
    const contentText = getDirectiveContent(hostElement);
    const importPath = getImportPath(component, pkg);
    md += `**Type:** Directive — apply as attribute to existing element\n`;
    md += `**Selector:** \`${component.selector || `[${attrName}]`}\`\n`;
    if (importPath && pkg) {
      md += `**Import:** \`import { ${getExportName(name, pkg.importSuffix)} } from '${importPath}';\`\n`;
    }
    md += `\n## Basic Usage\n`;
    const attrs = requiredAttrs ? ` ${requiredAttrs}` : '';
    const voidElements = ['input', 'img', 'br', 'hr'];
    if (voidElements.includes(hostElement)) {
      md += `\`\`\`html\n<${hostElement} ${attrName}${attrs} />\n\`\`\`\n`;
    } else {
      md += `\`\`\`html\n<${hostElement} ${attrName}${attrs}>${contentText}</${hostElement}>\n\`\`\`\n`;
    }
  } else {
    const selector = component.selector ||
      name.replace(/Component$|Directive$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const importPath = getImportPath(component, pkg);
    md += `**Type:** Component\n`;
    md += `**Selector:** \`<${selector}>\`\n`;
    if (importPath && pkg) {
      md += `**Import:** \`import { ${getExportName(name, pkg.importSuffix)} } from '${importPath}';\`\n`;
    }
    md += `\n## Basic Usage\n`;
    const attrs = requiredAttrs ? ` ${requiredAttrs}` : '';
    md += `\`\`\`html\n<${selector}${attrs}></${selector}>\n\`\`\`\n`;
  }

  // Description
  if (component.description) {
    md += `\n## Description\n${component.description}\n`;
  }

  // Inputs
  if (component.inputs && component.inputs.length > 0) {
    md += `\n## Inputs\n`;
    md += '| Name | Type | Required | Description |\n';
    md += '|------|------|----------|-------------|\n';
    for (const input of component.inputs) {
      const required = input.required ? '**Yes**' : 'No';
      md += `| \`${input.name}\` | \`${input.type || 'unknown'}\` | ${required} | ${input.description || ''} |\n`;
    }
  }

  // Outputs
  if (component.outputs && component.outputs.length > 0) {
    md += `\n## Outputs (Events)\n`;
    md += '| Name | Description |\n';
    md += '|------|-------------|\n';
    for (const output of component.outputs) {
      md += `| \`${output.name}\` | ${output.description || ''} |\n`;
    }
  }

  // Examples (limit to 2)
  if (component.examples && component.examples.length > 0) {
    md += `\n## Examples\n`;
    for (const example of component.examples.slice(0, 2)) {
      if (example.title) md += `### ${example.title}\n`;
      const code = example.code.length > 500 ? example.code.slice(0, 500) + '\n// ...' : example.code;
      md += `\`\`\`${example.language || 'html'}\n${code}\n\`\`\`\n\n`;
    }
  }

  // Template fallback
  if (component.template && (!component.examples || component.examples.length === 0)) {
    const tmpl = component.template.length > 500 ? component.template.slice(0, 500) + '\n<!-- ... -->' : component.template;
    md += `\n## Template\n\`\`\`html\n${tmpl}\n\`\`\`\n`;
  }

  // Storybook link
  if (storybookUrl && storybookUrl.startsWith('http')) {
    md += `\n---\n_Full documentation: ${storybookUrl}/?path=/docs/${component.id}_\n`;
  }

  return md;
}

// ---------------------------------------------------------------------------
// Design tokens markdown
// ---------------------------------------------------------------------------

function formatDesignTokensDoc(kitName: string, tokens: NonNullable<Kit['designTokens']>): string | null {
  let md = `# ${kitName} Design Tokens\n\n`;
  let hasContent = false;

  if (tokens.colors && tokens.colors.length > 0) {
    hasContent = true;
    md += `## Colors\n`;
    md += '| Name | Value | CSS Variable |\n';
    md += '|------|-------|-------------|\n';
    for (const t of tokens.colors) {
      md += `| ${t.name} | \`${t.value}\` | ${t.cssVariable ? `\`${t.cssVariable}\`` : '-'} |\n`;
    }
    md += '\n';
  }

  if (tokens.typography && tokens.typography.length > 0) {
    hasContent = true;
    md += `## Typography\n`;
    md += '| Name | Font | Size | Weight | Line Height |\n';
    md += '|------|------|------|--------|-------------|\n';
    for (const t of tokens.typography) {
      md += `| ${t.name} | ${t.fontFamily || '-'} | ${t.fontSize || '-'} | ${t.fontWeight || '-'} | ${t.lineHeight || '-'} |\n`;
    }
    md += '\n';
  }

  if (tokens.spacing && tokens.spacing.length > 0) {
    hasContent = true;
    md += `## Spacing\n`;
    md += '| Name | Value | CSS Variable |\n';
    md += '|------|-------|-------------|\n';
    for (const t of tokens.spacing) {
      md += `| ${t.name} | \`${t.value}\` | ${t.cssVariable ? `\`${t.cssVariable}\`` : '-'} |\n`;
    }
    md += '\n';
  }

  if (tokens.shadows && tokens.shadows.length > 0) {
    hasContent = true;
    md += `## Shadows\n`;
    md += '| Name | Value |\n';
    md += '|------|-------|\n';
    for (const t of tokens.shadows) {
      md += `| ${t.name} | \`${t.value}\` |\n`;
    }
    md += '\n';
  }

  if (tokens.borderRadius && tokens.borderRadius.length > 0) {
    hasContent = true;
    md += `## Border Radius\n`;
    md += '| Name | Value |\n';
    md += '|------|-------|\n';
    for (const t of tokens.borderRadius) {
      md += `| ${t.name} | \`${t.value}\` |\n`;
    }
    md += '\n';
  }

  return hasContent ? md : null;
}
