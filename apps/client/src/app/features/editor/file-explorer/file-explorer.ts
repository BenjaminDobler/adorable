import { Component, input, output, signal, computed, Injectable, inject, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface FileAction {
  type: 'create-file' | 'create-folder' | 'delete' | 'rename' | 'upload';
  path: string;
  newPath?: string;
  content?: string;
}

@Injectable({ providedIn: 'root' })
export class FileExplorerState {
  expandedPaths = signal<Set<string>>(new Set());
  selectedFile = signal<{ name: string; path: string; content: string } | null>(null);

  // Context menu state
  contextMenu = signal<{ x: number; y: number; node: FileNode | null; parentPath: string } | null>(null);

  // Inline input state (for new file/folder/rename)
  inlineInput = signal<{ parentPath: string; type: 'file' | 'folder' | 'rename'; existingName?: string } | null>(null);

  // Debug: show internal files like .adorable/
  private _showInternalFiles = signal(localStorage.getItem('adorable_show_internal') === 'true');
  get showInternalFiles() {
    return this._showInternalFiles;
  }

  setShowInternalFiles(value: boolean) {
    this._showInternalFiles.set(value);
    localStorage.setItem('adorable_show_internal', String(value));
  }

  isExpanded(path: string): boolean {
    return this.expandedPaths().has(path);
  }

  toggle(path: string): void {
    const next = new Set(this.expandedPaths());
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    this.expandedPaths.set(next);
  }

  expand(path: string): void {
    const next = new Set(this.expandedPaths());
    next.add(path);
    this.expandedPaths.set(next);
  }
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
  originalData?: any;
}

@Component({
  selector: 'app-file-explorer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-explorer.html',
  styleUrl: './file-explorer.scss'
})
export class FileExplorerComponent {
  state = inject(FileExplorerState);
  level = input(0);
  path = input('');
  files = input<any>(null);

  fileSelect = output<{name: string, path: string, content: string}>();
  fileAction = output<FileAction>();

  isDesktop = !!(window as any).electronAPI?.isDesktop;

  nodes = computed(() => this.transformFiles(this.files()));
  dropTarget = signal<string | null>(null);

  private inlineConfirmed = false;
  private uploadTargetPath = '';

  transformFiles(files: any): FileNode[] {
    if (!files) return [];

    const nodes: FileNode[] = [];
    const currentPath = this.path();
    const showInternal = this.state.showInternalFiles();
    const entries = Object.entries(files).filter(([name]) => {
      // Hide internal directories at the root level
      if (!currentPath && name === 'node_modules') return false;
      if (!currentPath && name === '.adorable' && !showInternal) return false;
      return true;
    }).sort((a: any, b: any) => {
      const aIsDir = !!a[1].directory;
      const bIsDir = !!b[1].directory;
      if (aIsDir === bIsDir) return a[0].localeCompare(b[0]);
      return aIsDir ? -1 : 1;
    });

    for (const [name, content] of entries) {
      const node: any = content;
      const fullPath = currentPath ? `${currentPath}/${name}` : name;
      nodes.push({
        name,
        path: fullPath,
        type: node.directory ? 'folder' : 'file',
        content: node.file?.contents,
        originalData: node.directory
      });
    }
    return nodes;
  }

  toggleNode(node: FileNode) {
    if (node.type === 'folder') {
      this.state.toggle(node.path);
    } else {
      const sel = { name: node.name, path: node.path, content: node.content || '' };
      this.state.selectedFile.set(sel);
      this.fileSelect.emit(sel);
    }
  }

  onChildFileSelect(event: {name: string, path: string, content: string}) {
    this.fileSelect.emit(event);
  }

  // Context menu
  onNodeContextMenu(event: MouseEvent, node: FileNode) {
    event.preventDefault();
    event.stopPropagation();
    const parentPath = node.type === 'folder' ? node.path : this.path();
    this.state.contextMenu.set({ x: event.clientX, y: event.clientY, node, parentPath });
  }

  onTreeContextMenu(event: MouseEvent) {
    // Only trigger if clicking empty space (not on a node)
    const target = event.target as HTMLElement;
    if (target.closest('.node-content')) return;
    event.preventDefault();
    this.state.contextMenu.set({ x: event.clientX, y: event.clientY, node: null, parentPath: this.path() });
  }

  closeMenu() {
    this.state.contextMenu.set(null);
  }

  menuAction(action: string) {
    const ctx = this.state.contextMenu();
    if (!ctx) return;
    this.closeMenu();

    if (action === 'new-file') {
      if (ctx.node?.type === 'folder') this.state.expand(ctx.node.path);
      this.state.inlineInput.set({ parentPath: ctx.parentPath, type: 'file' });
      setTimeout(() => this.focusInlineInput(), 0);
    } else if (action === 'new-folder') {
      if (ctx.node?.type === 'folder') this.state.expand(ctx.node.path);
      this.state.inlineInput.set({ parentPath: ctx.parentPath, type: 'folder' });
      setTimeout(() => this.focusInlineInput(), 0);
    } else if (action === 'rename' && ctx.node) {
      this.state.inlineInput.set({ parentPath: ctx.parentPath, type: 'rename', existingName: ctx.node.name });
      setTimeout(() => {
        const input = document.querySelector('.inline-input') as HTMLInputElement;
        if (input) {
          input.focus();
          const dotIdx = input.value.lastIndexOf('.');
          input.setSelectionRange(0, dotIdx > 0 ? dotIdx : input.value.length);
        }
      }, 0);
    } else if (action === 'upload') {
      this.uploadTargetPath = ctx.parentPath;
      if (ctx.node?.type === 'folder') this.state.expand(ctx.node.path);
      const input = document.querySelector('input[type="file"][style*="display"]') as HTMLInputElement;
      if (input) {
        input.value = '';
        input.click();
      }
    } else if (action === 'delete' && ctx.node) {
      this.fileAction.emit({ type: 'delete', path: ctx.node.path });
    } else if (action === 'show-in-finder') {
      const targetPath = ctx.node?.path || ctx.parentPath || '';
      (window as any).electronAPI?.showInFinder(targetPath);
    }
  }

  isRenaming(node: FileNode): boolean {
    const inp = this.state.inlineInput();
    return !!inp && inp.type === 'rename' && inp.existingName === node.name && inp.parentPath === (node.type === 'folder' ? this.parentOf(node.path) : this.path());
  }

  isInlineTarget(parentPath: string): boolean {
    const inp = this.state.inlineInput();
    return !!inp && inp.type !== 'rename' && inp.parentPath === parentPath;
  }

  confirmNew(event: Event) {
    if (this.inlineConfirmed) return;
    const input = event.target as HTMLInputElement;
    const name = input.value.trim();
    const inp = this.state.inlineInput();
    if (!name || !inp) {
      this.cancelInline();
      return;
    }
    this.inlineConfirmed = true;
    const fullPath = inp.parentPath ? `${inp.parentPath}/${name}` : name;
    this.fileAction.emit({ type: inp.type === 'folder' ? 'create-folder' : 'create-file', path: fullPath });
    this.state.inlineInput.set(null);
    this.inlineConfirmed = false;
  }

  confirmRename(event: Event, node: FileNode) {
    if (this.inlineConfirmed) return;
    const input = event.target as HTMLInputElement;
    const newName = input.value.trim();
    if (!newName || newName === node.name) {
      this.cancelInline();
      return;
    }
    this.inlineConfirmed = true;
    const parentPath = this.parentOf(node.path);
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    this.fileAction.emit({ type: 'rename', path: node.path, newPath });
    this.state.inlineInput.set(null);
    this.inlineConfirmed = false;
  }

  cancelInline() {
    this.state.inlineInput.set(null);
  }

  private parentOf(path: string): string {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
  }

  private focusInlineInput() {
    const input = document.querySelector('.inline-input') as HTMLInputElement;
    if (input) input.focus();
  }

  // Drag and drop
  onDragOver(event: DragEvent, node: FileNode) {
    if (node.type !== 'folder') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dropTarget.set(node.path);
  }

  onDragLeave(event: DragEvent) {
    this.dropTarget.set(null);
  }

  onDrop(event: DragEvent, node: FileNode) {
    event.preventDefault();
    event.stopPropagation();
    this.dropTarget.set(null);
    if (node.type !== 'folder' || !event.dataTransfer?.files.length) return;
    this.state.expand(node.path);
    this.readAndEmitFiles(event.dataTransfer.files, node.path);
  }

  onUploadFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.readAndEmitFiles(input.files, this.uploadTargetPath);
    input.value = '';
  }

  private readAndEmitFiles(files: FileList, targetPath: string) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      const filePath = targetPath ? `${targetPath}/${file.name}` : file.name;

      if (file.type.startsWith('image/') || file.type === 'application/octet-stream') {
        reader.onload = (e: any) => {
          this.fileAction.emit({ type: 'upload', path: filePath, content: e.target.result });
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = (e: any) => {
          this.fileAction.emit({ type: 'upload', path: filePath, content: e.target.result });
        };
        reader.readAsText(file);
      }
    }
  }
}
