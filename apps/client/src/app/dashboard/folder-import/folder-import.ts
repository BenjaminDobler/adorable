import { Component, EventEmitter, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebContainerFiles, WebContainerFile, WebContainerDirectory } from '../../services/kit-types';

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  expanded: boolean;
  selected: boolean;
  indeterminate: boolean;  // For partial selection
  excluded: boolean;
  excludeReason?: string;
  size: number;
  children: TreeNode[];
  depth: number;
}

interface FileEntry {
  path: string;
  name: string;
  size: number;
  file: File;
}

@Component({
  selector: 'app-folder-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './folder-import.html',
  styleUrl: './folder-import.scss'
})
export class FolderImportComponent {
  @Output() import = new EventEmitter<{ files: WebContainerFiles; name: string; description: string }>();
  @Output() cancel = new EventEmitter<void>();

  // Form state
  kitName = signal('');
  kitDescription = signal('');
  folderPath = signal('');

  // File state
  fileTree = signal<TreeNode[]>([]);
  flatFiles = signal<FileEntry[]>([]);
  importing = signal(false);

  // Completely hidden patterns (not shown at all)
  private hiddenPatterns = [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    '.angular',
    '.nyc_output',
    '.cache',
    '.tmp'
  ];

  // Auto-excluded patterns (shown but disabled)
  private excludePatterns = [
    'dist',
    'build',
    'coverage',
    'tmp',
    'Thumbs.db',
    '*.log'
  ];

  // Max file size (1MB)
  private maxFileSize = 1024 * 1024;
  // Total size warning (5MB)
  private totalSizeWarning = 5 * 1024 * 1024;

  // Computed: flatten tree to get all selected files
  selectedFiles = computed(() => {
    const selected: TreeNode[] = [];
    const traverse = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (!node.isDirectory && node.selected && !node.excluded) {
          selected.push(node);
        }
        if (node.children.length > 0) {
          traverse(node.children);
        }
      }
    };
    traverse(this.fileTree());
    return selected;
  });

  selectedCount = computed(() => this.selectedFiles().length);
  totalSize = computed(() => this.selectedFiles().reduce((sum, f) => sum + f.size, 0));
  sizeWarning = computed(() => this.totalSize() > this.totalSizeWarning);

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async onFolderSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList || fileList.length === 0) return;

    // Get folder name from first file path
    const firstPath = fileList[0].webkitRelativePath;
    const folderName = firstPath.split('/')[0];
    this.folderPath.set(folderName);
    this.kitName.set(folderName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

    // Build flat file list
    const entries: FileEntry[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const relativePath = file.webkitRelativePath;
      const pathParts = relativePath.split('/');
      pathParts.shift(); // Remove root folder
      const path = pathParts.join('/');
      if (!path) continue;

      entries.push({
        path,
        name: file.name,
        size: file.size,
        file
      });
    }

    this.flatFiles.set(entries);

    // Build tree structure
    const tree = this.buildTree(entries);
    this.fileTree.set(tree);
  }

  // Dotfolders that should NOT be hidden (allowed through the dot-filter)
  private allowedDotFolders = ['.adorable'];

  private shouldHide(path: string): boolean {
    const parts = path.split('/');

    // Hide any path segment that starts with a dot (except allowed ones)
    for (const part of parts) {
      if (part.startsWith('.') && !this.allowedDotFolders.includes(part)) {
        return true;
      }
    }

    // Hide specific patterns
    for (const pattern of this.hiddenPatterns) {
      if (parts.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  private buildTree(entries: FileEntry[]): TreeNode[] {
    const root: TreeNode[] = [];
    const nodeMap = new Map<string, TreeNode>();

    // Sort entries for consistent order
    entries.sort((a, b) => a.path.localeCompare(b.path));

    for (const entry of entries) {
      // Skip completely hidden paths
      if (this.shouldHide(entry.path)) {
        continue;
      }

      const parts = entry.path.split('/');
      let currentPath = '';
      let currentNodes = root;
      let skipEntry = false;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        // Double-check hidden status for each path segment
        if (this.shouldHide(currentPath)) {
          skipEntry = true;
          break;
        }

        let node = nodeMap.get(currentPath);

        if (!node) {
          const { excluded, reason } = isLast
            ? this.shouldExclude(currentPath, entry.size)
            : this.shouldExcludeDir(currentPath);

          node = {
            name: part,
            path: currentPath,
            isDirectory: !isLast,
            expanded: i === 0, // Expand first level by default
            selected: !excluded,
            indeterminate: false,
            excluded,
            excludeReason: reason,
            size: isLast ? entry.size : 0,
            children: [],
            depth: i
          };
          nodeMap.set(currentPath, node);
          currentNodes.push(node);
        }

        currentNodes = node.children;
      }

      if (skipEntry) continue;
    }

    // Calculate initial selection state for directories
    this.updateDirectoryStates(root);

    return root;
  }

  private shouldExclude(path: string, size: number): { excluded: boolean; reason?: string } {
    if (size > this.maxFileSize) {
      return { excluded: true, reason: 'Too large (>1MB)' };
    }

    const fileName = path.split('/').pop() || '';

    for (const pattern of this.excludePatterns) {
      if (pattern.startsWith('*')) {
        const ext = pattern.slice(1);
        if (path.endsWith(ext)) {
          return { excluded: true, reason: `${pattern}` };
        }
      } else if (fileName === pattern) {
        return { excluded: true, reason: pattern };
      }
    }

    return { excluded: false };
  }

  private shouldExcludeDir(path: string): { excluded: boolean; reason?: string } {
    const dirName = path.split('/').pop() || '';
    for (const pattern of this.excludePatterns) {
      if (!pattern.startsWith('*') && dirName === pattern) {
        return { excluded: true, reason: pattern };
      }
    }
    return { excluded: false };
  }

  private updateDirectoryStates(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.isDirectory && node.children.length > 0) {
        this.updateDirectoryStates(node.children);
        this.updateNodeState(node);
      }
    }
  }

  private updateNodeState(node: TreeNode) {
    if (!node.isDirectory || node.children.length === 0) return;

    const selectableChildren = node.children.filter(c => !c.excluded);
    const selectedCount = selectableChildren.filter(c => c.selected && !c.indeterminate).length;
    const indeterminateCount = selectableChildren.filter(c => c.indeterminate).length;

    if (selectedCount === selectableChildren.length && indeterminateCount === 0) {
      node.selected = true;
      node.indeterminate = false;
    } else if (selectedCount === 0 && indeterminateCount === 0) {
      node.selected = false;
      node.indeterminate = false;
    } else {
      node.selected = false;
      node.indeterminate = true;
    }
  }

  toggleExpand(node: TreeNode) {
    if (!node.isDirectory) return;
    const updated = this.updateNode(this.fileTree(), node.path, n => ({
      ...n,
      expanded: !n.expanded
    }));
    this.fileTree.set(updated);
  }

  toggleSelect(node: TreeNode) {
    if (node.excluded) return;

    const newSelected = !node.selected || node.indeterminate;
    const updated = this.updateNodeAndChildren(this.fileTree(), node.path, newSelected);
    this.fileTree.set(updated);
  }

  private updateNode(nodes: TreeNode[], path: string, updater: (n: TreeNode) => TreeNode): TreeNode[] {
    return nodes.map(node => {
      if (node.path === path) {
        return updater(node);
      }
      if (node.children.length > 0) {
        return { ...node, children: this.updateNode(node.children, path, updater) };
      }
      return node;
    });
  }

  private updateNodeAndChildren(nodes: TreeNode[], path: string, selected: boolean): TreeNode[] {
    const setSelection = (n: TreeNode, sel: boolean): TreeNode => {
      if (n.excluded) return n;
      return {
        ...n,
        selected: sel,
        indeterminate: false,
        children: n.children.map(c => setSelection(c, sel))
      };
    };

    const result = nodes.map(node => {
      if (node.path === path) {
        return setSelection(node, selected);
      }
      if (node.children.length > 0) {
        const updatedChildren = this.updateNodeAndChildren(node.children, path, selected);
        const updatedNode = { ...node, children: updatedChildren };
        this.updateNodeState(updatedNode);
        return updatedNode;
      }
      return node;
    });

    return result;
  }

  selectAll() {
    const selectAllNodes = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map(n => ({
        ...n,
        selected: !n.excluded,
        indeterminate: false,
        children: selectAllNodes(n.children)
      }));
    this.fileTree.set(selectAllNodes(this.fileTree()));
  }

  deselectAll() {
    const deselectAllNodes = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map(n => ({
        ...n,
        selected: false,
        indeterminate: false,
        children: deselectAllNodes(n.children)
      }));
    this.fileTree.set(deselectAllNodes(this.fileTree()));
  }

  expandAll() {
    const expandAllNodes = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map(n => ({
        ...n,
        expanded: true,
        children: expandAllNodes(n.children)
      }));
    this.fileTree.set(expandAllNodes(this.fileTree()));
  }

  collapseAll() {
    const collapseAllNodes = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map(n => ({
        ...n,
        expanded: false,
        children: collapseAllNodes(n.children)
      }));
    this.fileTree.set(collapseAllNodes(this.fileTree()));
  }

  async confirmImport() {
    if (!this.kitName() || this.selectedCount() === 0) return;

    this.importing.set(true);

    try {
      const webContainerFiles = await this.convertToWebContainerFiles();
      this.import.emit({
        files: webContainerFiles,
        name: this.kitName(),
        description: this.kitDescription()
      });
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      this.importing.set(false);
    }
  }

  private async convertToWebContainerFiles(): Promise<WebContainerFiles> {
    const result: WebContainerFiles = {};
    const selectedPaths = new Set(this.selectedFiles().map(f => f.path));

    for (const entry of this.flatFiles()) {
      if (!selectedPaths.has(entry.path)) continue;

      const content = await this.readFile(entry.file);
      this.setNestedFile(result, entry.path, content);
    }

    return result;
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  private setNestedFile(root: WebContainerFiles, path: string, content: string) {
    const parts = path.split('/');
    let current: WebContainerFiles = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = { directory: {} };
      }
      const dir = current[part] as WebContainerDirectory;
      current = dir.directory;
    }

    const fileName = parts[parts.length - 1];
    current[fileName] = {
      file: { contents: content }
    };
  }

  getFileIcon(node: TreeNode): string {
    if (node.isDirectory) {
      return node.expanded ? '📂' : '📁';
    }
    const ext = node.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts': return '📘';
      case 'js': return '📙';
      case 'html': return '📄';
      case 'css':
      case 'scss':
      case 'sass': return '🎨';
      case 'json': return '📋';
      case 'md': return '📝';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg': return '🖼️';
      default: return '📄';
    }
  }
}
