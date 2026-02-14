/**
 * Storybook Parser
 *
 * Fetches and parses Storybook index.json to discover components.
 * Also fetches component documentation from Storybook docs pages.
 */

import {
  StorybookComponent,
  StorybookIndex,
  StorybookIndexEntry,
  ComponentDocumentation,
  ComponentProp,
  ComponentExample
} from './types';

export class StorybookParser {
  private baseUrl: string;

  constructor(storybookUrl: string) {
    // Normalize URL - remove trailing slash
    this.baseUrl = storybookUrl.replace(/\/$/, '');
  }

  /**
   * Fetch and parse the Storybook index.json to discover components
   */
  async discoverComponents(): Promise<StorybookComponent[]> {
    const indexUrl = `${this.baseUrl}/index.json`;

    const response = await fetch(indexUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Storybook index: ${response.status} ${response.statusText}`);
    }

    const data: StorybookIndex = await response.json();

    if (!data.entries) {
      throw new Error('Invalid Storybook index format: missing entries');
    }

    const components: StorybookComponent[] = [];
    const seenComponents = new Set<string>();

    for (const [id, entry] of Object.entries(data.entries)) {
      // We primarily care about docs entries as they contain the full documentation
      // But we also track stories for component examples
      const component = this.parseIndexEntry(id, entry);

      // Deduplicate by component name (we may have multiple stories per component)
      const key = component.componentName || component.title;
      if (component.type === 'docs' && !seenComponents.has(key)) {
        seenComponents.add(key);
        components.push(component);
      }
    }

    // Sort by title/category
    components.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return components;
  }

  /**
   * Parse a single Storybook index entry
   */
  private parseIndexEntry(id: string, entry: StorybookIndexEntry): StorybookComponent {
    // Extract component name and category from title
    // Title format is typically "Category/ComponentName" or "Category/Subcategory/ComponentName"
    const titleParts = entry.title.split('/');
    const componentName = titleParts[titleParts.length - 1];
    const category = titleParts.slice(0, -1).join('/');

    return {
      id: entry.id,
      title: entry.title,
      name: entry.name,
      importPath: entry.importPath,
      type: entry.type,
      componentName,
      category: category || undefined,
    };
  }

  /**
   * Fetch documentation for a specific component from its Storybook docs page
   */
  async getComponentDocumentation(component: StorybookComponent): Promise<ComponentDocumentation> {
    // Build the docs URL for this component
    const docsUrl = `${this.baseUrl}/?path=/docs/${component.id}`;

    const doc: ComponentDocumentation = {
      name: component.componentName || component.title,
      category: component.category,
      sourceUrl: docsUrl,
    };

    try {
      // First, try to get the prepared stories data which often contains more info
      const storiesData = await this.fetchPreparedStories(component.id);
      if (storiesData) {
        this.extractFromStoriesData(doc, storiesData);
      }

      // Try to fetch the iframe docs content directly (Storybook renders docs in an iframe)
      const iframeUrl = `${this.baseUrl}/iframe.html?viewMode=docs&id=${component.id}`;
      let html = '';

      try {
        const iframeResponse = await fetch(iframeUrl, {
          headers: { 'Accept': 'text/html' },
        });
        if (iframeResponse.ok) {
          html = await iframeResponse.text();
        }
      } catch {
        // Fallback to main page
        const response = await fetch(docsUrl, {
          headers: { 'Accept': 'text/html' },
        });
        if (response.ok) {
          html = await response.text();
        }
      }

      if (html) {
        // Log what we're getting for debugging
        const hasLxTags = html.includes('<lx-') || html.includes('lx-');
        const hasCodeBlocks = html.includes('<code');
        const htmlLength = html.length;
        console.log(`[StorybookParser] ${component.componentName}: fetched ${htmlLength} chars, hasLxTags=${hasLxTags}, hasCodeBlocks=${hasCodeBlocks}`);

        // Parse the HTML to extract documentation
        const parsedDoc = this.parseDocumentationHtml(html, component, docsUrl);

        console.log(`[StorybookParser] ${component.componentName}: extracted selector=${parsedDoc.selector || 'none'}, examples=${parsedDoc.examples?.length || 0}, props=${parsedDoc.props?.length || 0}`);

        // Merge with existing doc, preferring already-set values
        return {
          ...parsedDoc,
          ...doc,
          // But prefer parsed import statement if found
          importStatement: doc.importStatement || parsedDoc.importStatement,
          // But prefer parsed examples if we got them
          examples: parsedDoc.examples?.length ? parsedDoc.examples : doc.examples,
          props: parsedDoc.props?.length ? parsedDoc.props : doc.props,
        };
      }

      return doc;
    } catch (error) {
      // Return what we have on error
      return doc;
    }
  }

  /**
   * Try to fetch prepared stories data from Storybook
   * This often contains component metadata including selector
   */
  private async fetchPreparedStories(storyId: string): Promise<any | null> {
    try {
      // Try different Storybook API endpoints
      const endpoints = [
        `${this.baseUrl}/stories/${storyId}.json`,
        `${this.baseUrl}/.storybook/stories/${storyId}.json`,
      ];

      for (const url of endpoints) {
        try {
          const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
          });
          if (response.ok) {
            return await response.json();
          }
        } catch {
          continue;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract documentation from Storybook's prepared stories data
   */
  private extractFromStoriesData(doc: ComponentDocumentation, data: any): void {
    // Look for component metadata
    if (data.component) {
      // Angular components often have selector in the decorator
      const componentStr = typeof data.component === 'string' ? data.component : JSON.stringify(data.component);
      const selectorMatch = componentStr.match(/selector:\s*['"`]([^'"`]+)['"`]/);
      if (selectorMatch) {
        doc.selector = selectorMatch[1];
      }
    }

    // Look for argTypes which contain prop information
    if (data.argTypes) {
      doc.props = doc.props || [];
      for (const [propName, propInfo] of Object.entries(data.argTypes)) {
        const info = propInfo as any;
        doc.props.push({
          name: propName,
          type: info.type?.name || info.control?.type || 'unknown',
          description: info.description || undefined,
          defaultValue: info.defaultValue,
          required: info.table?.required || false,
        });
      }
    }

    // Look for docs description
    if (data.docs?.description?.component) {
      doc.description = data.docs.description.component;
    } else if (data.parameters?.docs?.description?.component) {
      doc.description = data.parameters.docs.description.component;
    }
  }

  /**
   * Parse Storybook docs HTML to extract component documentation
   */
  private parseDocumentationHtml(
    html: string,
    component: StorybookComponent,
    sourceUrl: string
  ): ComponentDocumentation {
    const doc: ComponentDocumentation = {
      name: component.componentName || component.title,
      category: component.category,
      sourceUrl,
    };

    // Try to extract description from the page
    // Storybook usually puts the description in a subtitle or description element
    const descriptionMatch = html.match(/<div[^>]*class="[^"]*sbdocs-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (descriptionMatch) {
      doc.description = this.stripHtml(descriptionMatch[1]).trim();
    }

    // Try to extract import statement - look for multiple patterns
    doc.importStatement = this.extractImportStatement(html, component.componentName || '');

    // Try to extract props/inputs from ArgsTable or Controls
    doc.props = this.extractProps(html);

    // Try to extract code examples from the page
    doc.examples = this.extractExamples(html);

    // Try to extract selector if it's an Angular component - multiple patterns
    doc.selector = this.extractSelector(html, component.componentName || '');

    return doc;
  }

  /**
   * Extract Angular selector from HTML using multiple patterns
   */
  private extractSelector(html: string, componentName: string): string | undefined {
    const decoded = this.decodeHtmlEntities(html);

    // Pattern 1: selector: 'xxx' in code/text
    const selectorMatch = decoded.match(/selector:\s*['"`]([^'"`]+)['"`]/);
    if (selectorMatch) {
      return selectorMatch[1];
    }

    // Pattern 2: Look for <lx-xxx> or [lxXxx] patterns in examples
    // This helps detect the selector from usage examples

    // Look for attribute directive pattern in HTML examples: <button lxButton>
    const attrPattern = new RegExp(`<\\w+[^>]*\\s(lx${componentName}|${componentName.toLowerCase()})(?:\\s|>|=)`, 'i');
    const attrMatch = decoded.match(attrPattern);
    if (attrMatch) {
      return `[${attrMatch[1]}]`;
    }

    // Look for element selector pattern: <lx-button> or <lx-component-name>
    const kebabName = componentName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const elementPatterns = [
      `<lx-${kebabName}`,
      `<lx${componentName.toLowerCase()}`,
      `<${kebabName}`,
    ];

    for (const pattern of elementPatterns) {
      if (decoded.toLowerCase().includes(pattern)) {
        const tagMatch = decoded.match(new RegExp(`<(lx-?${kebabName}|${kebabName})`, 'i'));
        if (tagMatch) {
          return tagMatch[1].toLowerCase();
        }
      }
    }

    // Pattern 3: Look for directive usage in code examples: lxButton, lxInput, etc.
    const directivePattern = new RegExp(`\\blx${componentName}\\b`, 'i');
    const directiveMatch = decoded.match(directivePattern);
    if (directiveMatch) {
      return `[${directiveMatch[0]}]`;
    }

    return undefined;
  }

  /**
   * Extract import statement from HTML using multiple patterns
   */
  private extractImportStatement(html: string, componentName: string): string | undefined {
    // Decode HTML entities first
    const decoded = this.decodeHtmlEntities(html);

    // Pattern 1: import statement in code tags
    const codeMatches = decoded.matchAll(/<code[^>]*>(import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"])[^<]*<\/code>/gi);
    for (const match of codeMatches) {
      const importText = this.stripHtml(match[1]).trim();
      if (importText.toLowerCase().includes(componentName.toLowerCase())) {
        return importText;
      }
    }

    // Pattern 2: import in pre>code blocks
    const preCodeMatches = decoded.matchAll(/<pre[^>]*>\s*<code[^>]*>(import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"])[^<]*<\/code>/gi);
    for (const match of preCodeMatches) {
      const importText = this.stripHtml(match[1]).trim();
      if (importText.toLowerCase().includes(componentName.toLowerCase())) {
        return importText;
      }
    }

    // Pattern 3: Raw import statement anywhere (common in MDX docs)
    const rawImportMatches = decoded.matchAll(/import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]/gi);
    for (const match of rawImportMatches) {
      const exports = match[1];
      const pkg = match[2];
      if (exports.toLowerCase().includes(componentName.toLowerCase())) {
        return `import { ${exports.trim()} } from '${pkg}';`;
      }
    }

    // Pattern 4: Look for "Import the X from package" text pattern and extract
    const textPattern = new RegExp(
      `Import[^.]*?(${componentName}\\w*)\\s+(?:component\\s+)?from\\s+['"]?(@[\\w/-]+|[\\w/-]+)['"]?`,
      'i'
    );
    const textMatch = decoded.match(textPattern);
    if (textMatch) {
      return `import { ${textMatch[1]} } from '${textMatch[2]}';`;
    }

    return undefined;
  }

  /**
   * Extract props/inputs from Storybook ArgsTable
   */
  private extractProps(html: string): ComponentProp[] {
    const props: ComponentProp[] = [];

    // Look for table rows in ArgsTable
    // Pattern: <tr><td>propName</td><td>type</td><td>description</td>...</tr>
    const tableRowMatches = html.matchAll(/<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi);

    for (const match of tableRowMatches) {
      const propName = this.stripHtml(match[1]).trim();
      const propType = this.stripHtml(match[2]).trim();
      const description = this.stripHtml(match[3]).trim();

      // Skip header rows
      if (propName.toLowerCase() === 'name' || propName.toLowerCase() === 'property') {
        continue;
      }

      if (propName) {
        props.push({
          name: propName,
          type: propType || 'unknown',
          description: description || undefined,
        });
      }
    }

    return props;
  }

  /**
   * Extract code examples from Storybook docs
   */
  private extractExamples(html: string): ComponentExample[] {
    const examples: ComponentExample[] = [];
    const decoded = this.decodeHtmlEntities(html);

    // Pattern 1: pre/code with language class
    const codeBlockMatches = decoded.matchAll(/<pre[^>]*>\s*<code[^>]*class="[^"]*language-(\w+)[^"]*"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi);
    for (const match of codeBlockMatches) {
      const language = match[1];
      const code = this.stripHtml(match[2]).trim();
      if (code.length > 15 && !code.startsWith('import')) {
        examples.push({ code, language });
      }
    }

    // Pattern 2: code blocks without language class
    const simpleCodeBlocks = decoded.matchAll(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi);
    for (const match of simpleCodeBlocks) {
      const code = this.stripHtml(match[1]).trim();
      if (code.length > 15 && code.includes('<') && !code.startsWith('import')) {
        examples.push({ code, language: 'html' });
      }
    }

    // Pattern 3: Storybook's docs-story wrapper with source
    const storySourceMatches = decoded.matchAll(/class="[^"]*docs-story[^"]*"[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>/gi);
    for (const match of storySourceMatches) {
      const code = this.stripHtml(match[1]).trim();
      if (code.length > 15 && code.includes('<')) {
        examples.push({ code, language: 'html' });
      }
    }

    // Pattern 4: Look for HTML-like content in any code element
    const anyCodeMatches = decoded.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/gi);
    for (const match of anyCodeMatches) {
      const code = this.stripHtml(match[1]).trim();
      // Look for Angular template-like content
      if (code.length > 20 && code.includes('<lx-') && !examples.some(e => e.code === code)) {
        examples.push({ code, language: 'html' });
      }
    }

    // Pattern 5: Look for raw HTML examples in the content (Angular components)
    const angularExamples = decoded.matchAll(/<(lx-[\w-]+)[^>]*>[\s\S]*?<\/\1>/gi);
    for (const match of angularExamples) {
      const code = match[0];
      if (code.length > 10 && !examples.some(e => e.code.includes(code))) {
        examples.push({ code: this.stripHtml(code), language: 'html' });
      }
    }

    // Deduplicate and limit
    const seen = new Set<string>();
    return examples.filter(e => {
      const key = e.code.substring(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }

  /**
   * Strip HTML tags from a string
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  /**
   * Get the base URL for this Storybook instance
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Build a docs URL for a component
   */
  getComponentDocsUrl(componentId: string): string {
    return `${this.baseUrl}/?path=/docs/${componentId}`;
  }
}
