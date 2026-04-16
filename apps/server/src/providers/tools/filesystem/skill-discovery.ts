import { AgentLoopContext } from '../../types';

/**
 * After editing a file that uses kit components, suggest reading
 * the relevant component docs if they haven't been read yet.
 * Returns a hint string to append to the tool result, or empty string.
 */
export async function discoverRelevantDocs(filePath: string, content: string, ctx: AgentLoopContext): Promise<string> {
  // Only relevant for TypeScript/HTML files with an active kit
  if (!ctx.activeKitId) return '';
  if (!filePath.match(/\.(ts|html|css|scss)$/)) return '';

  try {
    // Read available kit component docs
    const adorableFiles = await listAdorableComponentDocs(ctx);
    if (adorableFiles.length === 0) return '';

    // Extract component names from the file content
    const mentionedComponents = extractComponentReferences(content);
    if (mentionedComponents.length === 0) return '';

    // Find matching unread docs
    const unreadDocs: string[] = [];
    for (const compName of mentionedComponents) {
      const normalizedComp = compName.toLowerCase().replace(/component$/, '');
      for (const docPath of adorableFiles) {
        const docName = docPath.replace(/\.md$/, '').split('/').pop()?.toLowerCase() || '';
        if (docName.includes(normalizedComp) || normalizedComp.includes(docName)) {
          // Check if this doc was already read in this session
          if (!ctx.readFileState.has(docPath)) {
            unreadDocs.push(docPath);
          }
        }
      }
    }

    if (unreadDocs.length === 0) return '';

    const unique = [...new Set(unreadDocs)];
    return `\n\n💡 This file uses ${ctx.activeKitName || 'kit'} components. Consider reading the docs: ${unique.map(d => `\`${d}\``).join(', ')}`;
  } catch {
    return '';
  }
}

/** List .adorable/components/*.md files available in the project */
async function listAdorableComponentDocs(ctx: AgentLoopContext): Promise<string[]> {
  try {
    const files = await ctx.fs.glob('.adorable/components/*.md');
    return files.filter(f => !f.endsWith('README.md'));
  } catch {
    return [];
  }
}

/** Extract component names from TypeScript imports and HTML selectors */
function extractComponentReferences(content: string): string[] {
  const names: string[] = [];

  // Match TypeScript imports: import { FooComponent, BarComponent } from '...'
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const imports = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]);
    for (const imp of imports) {
      if (imp.endsWith('Component') || imp.endsWith('Module') || imp.endsWith('Directive')) {
        names.push(imp);
      }
    }
  }

  // Match HTML custom element selectors: <ui5-button, <fd-dialog, etc.
  const selectorRegex = /<([a-z][\w]*-[\w-]+)/g;
  while ((match = selectorRegex.exec(content)) !== null) {
    names.push(match[1]);
  }

  return [...new Set(names)];
}
