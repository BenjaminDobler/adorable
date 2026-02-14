/**
 * Kit Tools Provider
 *
 * Provides dynamic tools for interacting with component kits.
 * These tools allow the AI to:
 * - List available components in a kit
 * - Get documentation for specific components
 */

import { Kit, StorybookResource, ComponentDocumentation, DesignTokens } from './kits/types';
import { KitRegistry } from './kits/kit-registry';
import { StorybookParser } from './kits/storybook-parser';

export interface KitToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Generate tool definitions for a kit
 */
export function generateKitTools(kit: Kit): KitToolDefinition[] {
  const storybookResource = kit.resources.find(
    (r): r is StorybookResource => r.type === 'storybook'
  );

  if (!storybookResource || storybookResource.status !== 'discovered') {
    return [];
  }

  const selectedComponents = storybookResource.components
    .filter(c => storybookResource.selectedComponentIds.includes(c.id))
    .map(c => c.componentName || c.title);

  if (selectedComponents.length === 0) {
    return [];
  }

  const kitPrefix = sanitizeKitName(kit.name);

  return [
    {
      name: `${kitPrefix}_list_components`,
      description: `[Kit: ${kit.name}] List all available UI components in the ${kit.name} library.${kit.npmPackage ? ` Components are imported from '${kit.npmPackage}'.` : ''}`,
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional: Filter by category (e.g., "Forms", "Layout", "Navigation")'
          }
        },
        required: []
      }
    },
    {
      name: `${kitPrefix}_get_component`,
      description: `[Kit: ${kit.name}] Get documentation, usage examples, and props for a specific component in the ${kit.name} library. Use this before using a component to understand its API.`,
      input_schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: `Component name. Available: ${selectedComponents.slice(0, 10).join(', ')}${selectedComponents.length > 10 ? ', ...' : ''}`
          }
        },
        required: ['name']
      }
    },
    {
      name: `${kitPrefix}_get_design_tokens`,
      description: `[Kit: ${kit.name}] Get design tokens (colors, typography, spacing) for the ${kit.name} library. Use these tokens to ensure consistent styling with the design system.`,
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['colors', 'typography', 'spacing', 'shadows', 'borderRadius', 'all'],
            description: 'Token category to retrieve. Use "all" to get all categories.'
          }
        },
        required: []
      }
    }
  ];
}

/**
 * Execute a kit tool (case-insensitive matching)
 */
export async function executeKitTool(
  toolName: string,
  toolArgs: any,
  kit: Kit
): Promise<{ content: string; isError: boolean }> {
  const kitPrefix = sanitizeKitName(kit.name);
  const normalizedToolName = toolName.toLowerCase();

  console.log(`[KitTool] Executing ${toolName} (normalized: ${normalizedToolName}) with args:`, toolArgs);

  try {
    let result: { content: string; isError: boolean };

    if (normalizedToolName === `${kitPrefix}_list_components`) {
      result = executeListComponents(kit, toolArgs?.category);
    } else if (normalizedToolName === `${kitPrefix}_get_component`) {
      result = await executeGetComponent(kit, toolArgs?.name);
    } else if (normalizedToolName === `${kitPrefix}_get_design_tokens`) {
      result = executeGetDesignTokens(kit, toolArgs?.category);
    } else {
      result = {
        content: `Unknown kit tool: ${toolName}`,
        isError: true
      };
    }

    console.log(`[KitTool] ${toolName} result:`, { isError: result.isError, contentLength: result.content.length });
    return result;
  } catch (error) {
    console.error(`[KitTool] ${toolName} error:`, error);
    return {
      content: `Kit tool error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isError: true
    };
  }
}

/**
 * Execute list_components tool
 */
function executeListComponents(
  kit: Kit,
  category?: string
): { content: string; isError: boolean } {
  console.log(`[KitTool:ListComponents] Kit has ${kit.resources?.length || 0} resources`);

  const storybookResource = kit.resources.find(
    (r): r is StorybookResource => r.type === 'storybook'
  );

  if (!storybookResource) {
    console.log(`[KitTool:ListComponents] No Storybook resource found`);
    return {
      content: 'No Storybook resource found in this kit',
      isError: true
    };
  }

  console.log(`[KitTool:ListComponents] Storybook resource: status=${storybookResource.status}, components=${storybookResource.components?.length || 0}, selected=${storybookResource.selectedComponentIds?.length || 0}`);

  let components = storybookResource.components.filter(
    c => storybookResource.selectedComponentIds.includes(c.id)
  );

  console.log(`[KitTool:ListComponents] Filtered to ${components.length} selected components`);

  // Filter by category if specified
  if (category) {
    const categoryLower = category.toLowerCase();
    components = components.filter(
      c => c.category?.toLowerCase().includes(categoryLower)
    );
  }

  if (components.length === 0) {
    return {
      content: category
        ? `No components found in category "${category}"`
        : 'No components available in this kit',
      isError: false
    };
  }

  // Group by category
  const byCategory = new Map<string, string[]>();
  for (const comp of components) {
    const cat = comp.category || 'Other';
    if (!byCategory.has(cat)) {
      byCategory.set(cat, []);
    }
    byCategory.get(cat)!.push(comp.componentName || comp.title || comp.name || 'Unknown');
  }

  let result = `# ${kit.name} Components\n\n`;
  if (kit.npmPackage) {
    result += `**Package:** \`${kit.npmPackage}\`\n\n`;
  }

  for (const [cat, names] of byCategory) {
    result += `## ${cat}\n`;
    result += names.map(n => `- ${n}`).join('\n');
    result += '\n\n';
  }

  result += `\n_Use \`${sanitizeKitName(kit.name)}_get_component\` with a component name to get detailed documentation._`;

  return {
    content: result,
    isError: false
  };
}

/**
 * Execute get_component tool
 */
async function executeGetComponent(
  kit: Kit,
  componentName: string
): Promise<{ content: string; isError: boolean }> {
  if (!componentName) {
    return {
      content: 'Component name is required',
      isError: true
    };
  }

  const storybookResource = kit.resources.find(
    (r): r is StorybookResource => r.type === 'storybook'
  );

  if (!storybookResource) {
    return {
      content: 'No Storybook resource found in this kit',
      isError: true
    };
  }

  // Find the component
  const component = storybookResource.components.find(
    c => {
      const name = c.componentName || c.title || c.name || '';
      const title = c.title || '';
      return name.toLowerCase() === componentName.toLowerCase() ||
        title.toLowerCase().includes(componentName.toLowerCase()) ||
        name.toLowerCase().includes(componentName.toLowerCase());
    }
  );

  if (!component) {
    const available = storybookResource.components
      .filter(c => storybookResource.selectedComponentIds.includes(c.id))
      .map(c => c.componentName || c.title || c.name || 'Unknown')
      .slice(0, 10);

    return {
      content: `Component "${componentName}" not found. Available components: ${available.join(', ')}`,
      isError: true
    };
  }

  // Check if we have stored documentation on the component
  const hasStoredDocs = component.selector || component.examples?.length || component.description;

  if (hasStoredDocs) {
    // Use stored documentation (doesn't require live fetch)
    console.log(`[KitTool:GetComponent] ${componentName}: using stored docs - selector=${component.selector || 'none'}, examples=${component.examples?.length || 0}`);
    return {
      content: formatStoredComponentDocs(component, kit.npmPackage, kit.importSuffix, storybookResource.url),
      isError: false
    };
  }

  // Fallback: try to fetch documentation from Storybook (may fail due to dynamic rendering)
  const parser = new StorybookParser(storybookResource.url);

  try {
    const docs = await parser.getComponentDocumentation(component);
    console.log(`[KitTool:GetComponent] ${componentName}: fetched live - selector=${docs.selector || 'none'}, examples=${docs.examples?.length || 0}`);
    return {
      content: formatComponentDocumentation(docs, kit.npmPackage, kit.importSuffix),
      isError: false
    };
  } catch (error) {
    console.log(`[KitTool:GetComponent] ${componentName}: fetch failed, using basic info`);
    // Return basic info if fetching fails
    const docsUrl = parser.getComponentDocsUrl(component.id);
    return {
      content: formatBasicComponentInfo(component, docsUrl, kit.npmPackage, kit.importSuffix),
      isError: false
    };
  }
}

/**
 * Detect component type and generate usage hints based on selector
 */
function getComponentTypeAndUsage(selector: string | undefined, name: string): {
  type: 'directive' | 'component' | 'unknown';
  usageHint: string;
  exampleHtml: string;
} {
  // If no selector, try to infer from the component name
  if (!selector) {
    // Common UI elements that are typically directives in Angular libraries
    const directivePatterns = ['Button', 'Input', 'Textarea', 'Select', 'Checkbox', 'Radio', 'Toggle', 'Switch', 'Link'];
    const isLikelyDirective = directivePatterns.some(p => name.includes(p));

    if (isLikelyDirective) {
      // Generate a likely directive name (e.g., Button -> lxButton)
      const prefix = 'lx'; // Common prefix for component libraries
      const attrName = prefix + name.replace(/Component$|Directive$/, '');
      return {
        type: 'directive',
        usageHint: `**This is likely a DIRECTIVE.** Apply it as an attribute to an existing HTML element. Common pattern: \`${attrName}\``,
        exampleHtml: `<button ${attrName}>Click me</button>`
      };
    }

    // For other components, generate a likely element selector
    const baseName = name.replace(/Component$|Directive$/, '');
    const kebabName = baseName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const likelySelector = `lx-${kebabName}`;

    return {
      type: 'component',
      usageHint: `This is likely a **standalone component**. The selector is probably \`<${likelySelector}>\`.`,
      exampleHtml: `<${likelySelector}></${likelySelector}>`
    };
  }

  // Attribute selector like [lxButton] - this is a DIRECTIVE
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const attrName = selector.slice(1, -1);
    return {
      type: 'directive',
      usageHint: `**This is a DIRECTIVE**, not a standalone component. Apply it as an attribute to an existing HTML element (typically a <button> or similar).`,
      exampleHtml: `<button ${attrName}>Click me</button>`
    };
  }

  // Multiple selectors separated by comma
  if (selector.includes(',')) {
    const selectors = selector.split(',').map(s => s.trim());
    const attrSelector = selectors.find(s => s.startsWith('['));
    if (attrSelector) {
      const attrName = attrSelector.slice(1, -1);
      return {
        type: 'directive',
        usageHint: `**This is a DIRECTIVE** with multiple selector options. The primary usage is as an attribute: \`${attrSelector}\``,
        exampleHtml: `<button ${attrName}>Click me</button>`
      };
    }
  }

  // Check if selector is a native HTML element - this usually means it's a directive
  // that applies to native elements (e.g., selector: 'button' for ButtonDirective)
  const nativeElements = ['button', 'input', 'textarea', 'select', 'a', 'img', 'form', 'label', 'span', 'div'];
  if (nativeElements.includes(selector.toLowerCase())) {
    // This is likely a directive that uses an attribute on native elements
    const prefix = 'lx'; // Common prefix
    const attrName = prefix + name.replace(/Component$|Directive$/, '');
    return {
      type: 'directive',
      usageHint: `**This is a DIRECTIVE** that enhances the native \`<${selector}>\` element. Apply the \`${attrName}\` attribute to use it.`,
      exampleHtml: `<${selector} ${attrName}>Content</${selector}>`
    };
  }

  // Element selector like lx-button - this is a COMPONENT
  if (/^[a-z][\w-]*$/i.test(selector)) {
    return {
      type: 'component',
      usageHint: `This is a **standalone component**. Use it as a custom HTML element.`,
      exampleHtml: `<${selector}></${selector}>`
    };
  }

  return {
    type: 'unknown',
    usageHint: `Selector: \`${selector}\``,
    exampleHtml: `<!-- See Storybook for usage examples -->`
  };
}

/**
 * Get the export name for a component using the kit's configured suffix
 */
function getExportName(name: string, suffix: string | undefined): string {
  // If already ends with a common suffix, use as-is
  if (name.endsWith('Component') || name.endsWith('Directive') || name.endsWith('Module')) {
    return name;
  }

  // Apply the configured suffix (or default to Component)
  const actualSuffix = suffix ?? 'Component';
  return actualSuffix ? `${name}${actualSuffix}` : name;
}

/**
 * Generate a meaningful example value for an input based on its name and type
 */
function getExampleValue(inputName: string, inputType: string): string {
  const name = inputName.toLowerCase();

  // String-like inputs
  if (name.includes('content') || name.includes('text') || name.includes('label')) {
    return 'Your text';
  }
  if (name.includes('title')) {
    return 'Title';
  }
  if (name.includes('name')) {
    return 'name';
  }
  if (name.includes('url') || name.includes('href') || name.includes('src')) {
    return 'https://example.com';
  }
  if (name.includes('icon')) {
    return 'icon-name';
  }
  if (name.includes('color')) {
    return 'primary';
  }
  if (name.includes('size')) {
    return 'medium';
  }
  if (name.includes('type') || name.includes('variant')) {
    return 'default';
  }

  // Boolean-like inputs
  if (name.includes('disabled') || name.includes('readonly') || name.includes('loading')) {
    return 'false';
  }
  if (name.includes('visible') || name.includes('show') || name.includes('open') || name.includes('active')) {
    return 'true';
  }

  // Number-like inputs
  if (name.includes('count') || name.includes('index') || name.includes('limit')) {
    return '0';
  }

  // Type-based fallbacks
  if (inputType?.includes('string')) return 'value';
  if (inputType?.includes('number')) return '0';
  if (inputType?.includes('boolean')) return 'true';

  return 'value';
}

/**
 * Format component documentation for AI consumption
 */
function formatComponentDocumentation(
  docs: ComponentDocumentation,
  npmPackage?: string,
  importSuffix?: string
): string {
  let result = `# ${docs.name}\n\n`;

  if (docs.category) {
    result += `**Category:** ${docs.category}\n`;
  }

  // Get component type and usage info FIRST - this is critical for AI understanding
  const { type, usageHint, exampleHtml } = getComponentTypeAndUsage(docs.selector, docs.name);

  // Show usage type prominently at the top
  result += `\n## Usage Type\n`;
  result += `${usageHint}\n`;

  if (docs.description) {
    result += `\n## Description\n${docs.description}\n`;
  }

  // Import statement - try to use the actual import if available, otherwise use configured suffix
  result += `\n## Import\n`;
  if (docs.importStatement) {
    result += `\`\`\`typescript\n${docs.importStatement}\n\`\`\`\n`;
  } else if (npmPackage) {
    const exportName = getExportName(docs.name, importSuffix);
    result += `\`\`\`typescript\nimport { ${exportName} } from '${npmPackage}';\n\`\`\`\n`;
  }

  // Selector with clear usage
  if (docs.selector) {
    result += `\n## Selector\n\`${docs.selector}\`\n`;
  }

  // Basic usage example based on component type (always include this)
  result += `\n## Basic Usage\n`;
  result += `\`\`\`html\n${exampleHtml}\n\`\`\`\n`;

  // Props
  if (docs.props && docs.props.length > 0) {
    result += `\n## Props/Inputs\n`;
    result += '| Name | Type | Description |\n';
    result += '|------|------|-------------|\n';
    for (const prop of docs.props) {
      const desc = prop.description || '';
      result += `| \`${prop.name}\` | \`${prop.type}\` | ${desc} |\n`;
    }
  }

  // Examples from Storybook (if available)
  if (docs.examples && docs.examples.length > 0) {
    result += `\n## Examples from Storybook\n`;
    for (const example of docs.examples.slice(0, 3)) {
      if (example.title) {
        result += `### ${example.title}\n`;
      }
      result += `\`\`\`${example.language || 'html'}\n${example.code}\n\`\`\`\n\n`;
    }
  }

  // Source link
  if (docs.sourceUrl) {
    result += `\n---\n_Documentation source: ${docs.sourceUrl}_\n`;
  }

  return result;
}

/**
 * Format stored component documentation (from kit data, not live fetched)
 */
function formatStoredComponentDocs(
  component: any,
  npmPackage?: string,
  importSuffix?: string,
  storybookUrl?: string
): string {
  const name = component.componentName || component.title || component.name || 'Unknown';

  let result = `# ${name}\n\n`;

  if (component.category) {
    result += `**Category:** ${component.category}\n`;
  }

  // Usage type from stored data or inferred
  // Get required inputs for examples
  const requiredInputs = component.inputs?.filter((i: any) => i.required) || [];
  const requiredInputAttrs = requiredInputs.map((i: any) => `[${i.name}]="${getExampleValue(i.name, i.type)}"`).join(' ');

  if (component.usageType || component.selector) {
    result += `\n## Usage Type\n`;
    if (component.usageType === 'directive' || component.selector?.includes('[')) {
      // Extract attribute from selector like "button[lx-button]" or "[lxButton]"
      const attrMatch = component.selector?.match(/\[([^\]]+)\]/);
      const attrName = attrMatch ? attrMatch[1] : `lx${name.replace(/Component$|Directive$/, '')}`;
      const hostElement = component.selector?.split('[')[0] || 'button';
      result += `**This is a DIRECTIVE.** Apply it as an attribute to an existing HTML element.\n`;
      result += `\n## Basic Usage\n`;
      if (requiredInputAttrs) {
        result += `\`\`\`html\n<${hostElement} ${attrName} ${requiredInputAttrs}>Click me</${hostElement}>\n\`\`\`\n`;
      } else {
        result += `\`\`\`html\n<${hostElement} ${attrName}>Click me</${hostElement}>\n\`\`\`\n`;
      }
    } else {
      const selector = component.selector || `lx-${name.replace(/Component$|Directive$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;
      result += `This is a **standalone component**. Use it as a custom HTML element.\n`;
      result += `\n## Basic Usage\n`;
      if (requiredInputAttrs) {
        result += `\`\`\`html\n<${selector} ${requiredInputAttrs}></${selector}>\n\`\`\`\n`;
      } else {
        result += `\`\`\`html\n<${selector}></${selector}>\n\`\`\`\n`;
      }
    }
  } else {
    // No stored usage type, try to infer
    const { type, usageHint, exampleHtml } = getComponentTypeAndUsage(component.selector, name);
    result += `\n## Usage Type\n`;
    result += `${usageHint}\n`;
    result += `\n## Basic Usage\n`;
    // Try to add required inputs to the inferred example
    if (requiredInputAttrs && exampleHtml.includes('><')) {
      const modifiedExample = exampleHtml.replace('><', ` ${requiredInputAttrs}><`);
      result += `\`\`\`html\n${modifiedExample}\n\`\`\`\n`;
    } else {
      result += `\`\`\`html\n${exampleHtml}\n\`\`\`\n`;
    }
  }

  // Description
  if (component.description) {
    result += `\n## Description\n${component.description}\n`;
  }

  // Import statement
  result += `\n## Import\n`;
  if (npmPackage) {
    const exportName = getExportName(name, importSuffix);
    result += `\`\`\`typescript\nimport { ${exportName} } from '${npmPackage}';\n\`\`\`\n`;
  }

  // Selector
  if (component.selector) {
    result += `\n## Selector\n\`${component.selector}\`\n`;
  }

  // Inputs (with required status)
  if (component.inputs && component.inputs.length > 0) {
    result += `\n## Inputs\n`;
    result += '| Name | Type | Required | Description |\n';
    result += '|------|------|----------|-------------|\n';
    for (const input of component.inputs) {
      const required = input.required ? '**Yes**' : 'No';
      const desc = input.description || '';
      const type = input.type || 'unknown';
      result += `| \`${input.name}\` | \`${type}\` | ${required} | ${desc} |\n`;
    }
  }

  // Outputs
  if (component.outputs && component.outputs.length > 0) {
    result += `\n## Outputs (Events)\n`;
    result += '| Name | Description |\n';
    result += '|------|-------------|\n';
    for (const output of component.outputs) {
      const desc = output.description || '';
      result += `| \`${output.name}\` | ${desc} |\n`;
    }
  }

  // Stored examples
  if (component.examples && component.examples.length > 0) {
    result += `\n## Examples\n`;
    for (const example of component.examples) {
      if (example.title) {
        result += `### ${example.title}\n`;
      }
      result += `\`\`\`${example.language || 'html'}\n${example.code}\n\`\`\`\n\n`;
    }
  }

  // Template (if available and no examples)
  if (component.template && (!component.examples || component.examples.length === 0)) {
    result += `\n## Template\n`;
    result += `\`\`\`html\n${component.template}\n\`\`\`\n`;
  }

  // Storybook link (only if URL is provided)
  if (storybookUrl && storybookUrl.startsWith('http')) {
    const docsUrl = `${storybookUrl}/?path=/docs/${component.id}`;
    result += `\n---\n_Full documentation: ${docsUrl}_\n`;
  }

  return result;
}

/**
 * Format basic component info when full docs are unavailable
 */
function formatBasicComponentInfo(
  component: any,
  docsUrl: string,
  npmPackage?: string,
  importSuffix?: string
): string {
  const name = component.componentName || component.title || component.name || 'Unknown';

  let result = `# ${name}\n\n`;

  if (component.category) {
    result += `**Category:** ${component.category}\n`;
  }

  // Try to infer component type from the name
  // Common directive patterns: names ending with Directive, or camelCase like lxButton
  const looksLikeDirective = name && (name.endsWith('Directive') ||
    (name.length > 2 && name[0].toLowerCase() === name[0] && /^[a-z]+[A-Z]/.test(name)));

  if (looksLikeDirective) {
    // Try to generate attribute name from component name (e.g., LxButton -> lxButton)
    const attrName = name.charAt(0).toLowerCase() + name.slice(1);
    result += `\n## Usage Type\n`;
    result += `**This appears to be a DIRECTIVE.** Apply it as an attribute to an existing HTML element.\n`;
    result += `\n## Basic Usage (inferred)\n`;
    result += `\`\`\`html\n<button ${attrName}>Click me</button>\n\`\`\`\n`;
    result += `\n_Note: Check Storybook documentation to confirm the exact attribute name._\n`;
  }

  result += `\n## Import\n`;
  if (npmPackage) {
    const exportName = getExportName(name, importSuffix);
    result += `\`\`\`typescript\nimport { ${exportName} } from '${npmPackage}';\n\`\`\`\n`;
  } else {
    result += `_Import path not available_\n`;
  }

  result += `\n## Full Documentation\n`;
  result += `View complete documentation with examples at: ${docsUrl}\n`;

  return result;
}

/**
 * Execute get_design_tokens tool
 */
function executeGetDesignTokens(
  kit: Kit,
  category?: string
): { content: string; isError: boolean } {
  const tokens = kit.designTokens;

  if (!tokens) {
    return {
      content: `No design tokens available for ${kit.name}. Design tokens may need to be extracted from the Storybook.`,
      isError: false
    };
  }

  const cat = category?.toLowerCase() || 'all';

  let result = `# ${kit.name} Design Tokens\n\n`;

  // Colors
  if ((cat === 'all' || cat === 'colors') && tokens.colors && tokens.colors.length > 0) {
    result += `## Colors\n`;
    result += '| Name | Value | CSS Variable |\n';
    result += '|------|-------|-------------|\n';
    for (const token of tokens.colors) {
      result += `| ${token.name} | \`${token.value}\` | ${token.cssVariable ? `\`${token.cssVariable}\`` : '-'} |\n`;
    }
    result += '\n';
  }

  // Typography
  if ((cat === 'all' || cat === 'typography') && tokens.typography && tokens.typography.length > 0) {
    result += `## Typography\n`;
    result += '| Name | Font | Size | Weight | Line Height |\n';
    result += '|------|------|------|--------|-------------|\n';
    for (const token of tokens.typography) {
      result += `| ${token.name} | ${token.fontFamily || '-'} | ${token.fontSize || '-'} | ${token.fontWeight || '-'} | ${token.lineHeight || '-'} |\n`;
    }
    result += '\n';
  }

  // Spacing
  if ((cat === 'all' || cat === 'spacing') && tokens.spacing && tokens.spacing.length > 0) {
    result += `## Spacing\n`;
    result += '| Name | Value | CSS Variable |\n';
    result += '|------|-------|-------------|\n';
    for (const token of tokens.spacing) {
      result += `| ${token.name} | \`${token.value}\` | ${token.cssVariable ? `\`${token.cssVariable}\`` : '-'} |\n`;
    }
    result += '\n';
  }

  // Shadows
  if ((cat === 'all' || cat === 'shadows') && tokens.shadows && tokens.shadows.length > 0) {
    result += `## Shadows\n`;
    result += '| Name | Value |\n';
    result += '|------|-------|\n';
    for (const token of tokens.shadows) {
      result += `| ${token.name} | \`${token.value}\` |\n`;
    }
    result += '\n';
  }

  // Border Radius
  if ((cat === 'all' || cat === 'borderradius') && tokens.borderRadius && tokens.borderRadius.length > 0) {
    result += `## Border Radius\n`;
    result += '| Name | Value |\n';
    result += '|------|-------|\n';
    for (const token of tokens.borderRadius) {
      result += `| ${token.name} | \`${token.value}\` |\n`;
    }
    result += '\n';
  }

  if (result === `# ${kit.name} Design Tokens\n\n`) {
    return {
      content: `No tokens found for category "${category || 'all'}"`,
      isError: false
    };
  }

  return {
    content: result,
    isError: false
  };
}

/**
 * Sanitize kit name for use as tool prefix
 */
function sanitizeKitName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);
}

/**
 * Check if a tool name belongs to a kit (case-insensitive)
 */
export function isKitTool(toolName: string, kit: Kit): boolean {
  const prefix = sanitizeKitName(kit.name);
  return toolName.toLowerCase().startsWith(`${prefix}_`);
}

/**
 * Get the kit prefix for a kit
 */
export function getKitToolPrefix(kit: Kit): string {
  return sanitizeKitName(kit.name);
}

/**
 * Kit tool suffixes that we recognize
 */
const KIT_TOOL_SUFFIXES = ['_list_components', '_get_component', '_get_design_tokens'];

/**
 * Check if a tool name looks like a misspelled kit tool and suggest corrections.
 * Returns null if it doesn't look like a kit tool, or a suggestion object.
 */
export function suggestKitToolCorrection(
  toolName: string,
  kit: Kit
): { suggestion: string; availableTools: string[] } | null {
  const lowerToolName = toolName.toLowerCase();

  // Check if the tool name ends with a known kit tool suffix
  const matchingSuffix = KIT_TOOL_SUFFIXES.find(suffix => lowerToolName.endsWith(suffix));

  if (!matchingSuffix) {
    return null;
  }

  // It looks like a kit tool - generate the correct names
  const prefix = sanitizeKitName(kit.name);
  const availableTools = KIT_TOOL_SUFFIXES.map(suffix => `${prefix}${suffix}`);
  const correctTool = `${prefix}${matchingSuffix}`;

  // If the tool name already matches (case-insensitive), no suggestion needed
  if (lowerToolName === correctTool) {
    return null;
  }

  return {
    suggestion: correctTool,
    availableTools
  };
}
