/**
 * Pure helpers for navigating the project file tree and summarizing Figma
 * node payloads. Extracted from chat.component.ts so the component stays
 * focused on UI orchestration; these functions are unit-testable in
 * isolation.
 *
 * The FileTree shape used here matches the one in @adorable/shared-types
 * but kept loosely-typed (`any`) to mirror the component's existing usage —
 * tightening that is a separate concern (see T1/T3).
 */

/**
 * Narrow a project's file tree to a specific app within a monorepo
 * (e.g. `apps/web` inside an Nx workspace).
 *
 * Walks `selectedApp` into the tree, then rebuilds the nested directory
 * structure so absolute paths the model sees match what's on disk
 * (e.g. `apps/web/src/main.ts` rather than `src/main.ts`). Falls back to
 * the full tree if `selectedApp` is missing, '.', or doesn't resolve.
 */
export function scopeFilesToSelectedApp(files: any, selectedApp: string | undefined | null): any {
  if (!files) return {};
  if (!selectedApp || selectedApp === '.') return files;

  const parts = selectedApp.split('/');
  let node: any = files;
  for (const part of parts) {
    if (node[part]?.directory) {
      node = node[part].directory;
    } else {
      return files; // path not found — fall back to full tree
    }
  }

  // Rebuild the nested structure so paths stay correct.
  let scoped: any = node;
  for (let i = parts.length - 1; i >= 0; i--) {
    scoped = { [parts[i]]: { directory: scoped } };
  }
  return scoped;
}

/**
 * Walk `public/assets/**` for image files. Returns relative paths the chat
 * UI can show as preview thumbnails the user can attach.
 */
export function extractImageAssets(files: any): { path: string; name: string }[] {
  if (!files) return [];

  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
  const assets: { path: string; name: string }[] = [];

  const traverse = (node: any, currentPath: string): void => {
    if (node.file) {
      const ext = currentPath.substring(currentPath.lastIndexOf('.')).toLowerCase();
      if (imageExtensions.includes(ext)) {
        const name = currentPath.split('/').pop() || currentPath;
        assets.push({ path: currentPath, name });
      }
    } else if (node.directory) {
      for (const key in node.directory) {
        traverse(node.directory[key], `${currentPath}${key}/`.replace('//', '/'));
      }
    }
  };

  if (files['public']?.directory?.['assets']?.directory) {
    traverse({ directory: files['public'].directory['assets'].directory }, 'assets/');
  }

  return assets;
}

/**
 * Render a Figma `getNode` response into a compact human-readable summary.
 * Each top-level node becomes its own indented tree (max depth 3, max 10
 * children per node). The result is fed into the agent prompt so the model
 * can reason about layout without bloating the context with raw JSON.
 */
export function simplifyFigmaContext(context: Record<string, any>): string {
  const summaries: string[] = [];
  for (const nodeId of Object.keys(context)) {
    const node = context[nodeId]?.document;
    if (!node) continue;
    summaries.push(summarizeNode(node, 0));
  }
  return summaries.join('\n\n');
}

function summarizeNode(node: any, depth: number): string {
  if (depth > 3) return '';

  const indent = '  '.repeat(depth);
  const dims = node.absoluteBoundingBox
    ? ` (${Math.round(node.absoluteBoundingBox.width)}×${Math.round(node.absoluteBoundingBox.height)})`
    : '';

  let line = `${indent}- ${node.name} [${node.type}]${dims}`;

  if (node.children && node.children.length > 0 && depth < 3) {
    const childSummaries = node.children
      .slice(0, 10)
      .map((child: any) => summarizeNode(child, depth + 1))
      .filter((s: string) => s);

    if (childSummaries.length > 0) {
      line += '\n' + childSummaries.join('\n');
    }

    if (node.children.length > 10) {
      line += `\n${indent}  ... and ${node.children.length - 10} more children`;
    }
  }

  return line;
}
