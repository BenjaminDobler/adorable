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
  template: `
    <div class="file-tree" (contextmenu)="onTreeContextMenu($event)">
      @for (node of nodes(); track node.path) {
        <div class="tree-node">
          <div class="node-content"
               [class.active]="state.selectedFile()?.path === node.path"
               [class.drop-target]="dropTarget() === node.path"
               [style.padding-left.px]="level() * 12 + 8"
               (click)="toggleNode(node)"
               (contextmenu)="onNodeContextMenu($event, node)"
               (dragover)="onDragOver($event, node)"
               (dragleave)="onDragLeave($event)"
               (drop)="onDrop($event, node)">

            @if (node.type === 'folder') {
              <span class="arrow" [class.expanded]="state.isExpanded(node.path)">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </span>
              <span class="icon folder">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              </span>
            } @else {
              <span class="indent"></span>
              <span class="icon file">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
              </span>
            }

            @if (isRenaming(node)) {
              <input class="inline-input"
                     #renameInput
                     [value]="node.name"
                     (keydown.enter)="confirmRename($event, node)"
                     (keydown.escape)="cancelInline()"
                     (blur)="confirmRename($event, node)"
                     (click)="$event.stopPropagation()" />
            } @else {
              <span class="name">{{ node.name }}</span>
            }
          </div>

          @if (node.type === 'folder' && state.isExpanded(node.path)) {
            <!-- Inline input for new file/folder inside this folder -->
            @if (isInlineTarget(node.path)) {
              <div class="node-content inline-new" [style.padding-left.px]="(level() + 1) * 12 + 8">
                <span class="indent"></span>
                <span class="icon" [class.folder]="state.inlineInput()?.type === 'folder'" [class.file]="state.inlineInput()?.type === 'file'">
                  @if (state.inlineInput()?.type === 'folder') {
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                  } @else {
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                  }
                </span>
                <input class="inline-input"
                       #inlineNewInput
                       placeholder="Enter name..."
                       (keydown.enter)="confirmNew($event)"
                       (keydown.escape)="cancelInline()"
                       (blur)="confirmNew($event)" />
              </div>
            }

            <div class="children">
              <app-file-explorer
                [files]="node.originalData"
                [level]="level() + 1"
                [path]="path() ? path() + '/' + node.name : node.name"
                (fileSelect)="onChildFileSelect($event)"
                (fileAction)="fileAction.emit($event)">
              </app-file-explorer>
            </div>
          }
        </div>
      }

      <!-- Inline input for new file/folder at this level (only if not already shown by parent) -->
      @if (level() === 0 && isInlineTarget(path())) {
        <div class="node-content inline-new" [style.padding-left.px]="level() * 12 + 8">
          <span class="indent"></span>
          <span class="icon" [class.folder]="state.inlineInput()?.type === 'folder'" [class.file]="state.inlineInput()?.type === 'file'">
            @if (state.inlineInput()?.type === 'folder') {
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            } @else {
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
            }
          </span>
          <input class="inline-input"
                 #inlineNewInput
                 placeholder="Enter name..."
                 (keydown.enter)="confirmNew($event)"
                 (keydown.escape)="cancelInline()"
                 (blur)="confirmNew($event)" />
        </div>
      }
    </div>

    <!-- Context menu (only rendered at root level) -->
    @if (level() === 0 && state.contextMenu()) {
      <div class="context-menu-backdrop" (click)="closeMenu()" (contextmenu)="closeMenu(); $event.preventDefault()"></div>
      <div class="context-menu"
           [style.left.px]="state.contextMenu()!.x"
           [style.top.px]="state.contextMenu()!.y">
        <button (click)="menuAction('new-file')">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
          New File
        </button>
        <button (click)="menuAction('new-folder')">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
          New Folder
        </button>
        <button (click)="menuAction('upload')">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          Upload File
        </button>
        @if (state.contextMenu()!.node) {
          <div class="menu-divider"></div>
          <button (click)="menuAction('rename')">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Rename
          </button>
          <button class="danger" (click)="menuAction('delete')">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete
          </button>
        }
      </div>
    }

    <!-- Hidden file input for upload -->
    @if (level() === 0) {
      <input type="file" #uploadFileInput multiple style="display:none"
             (change)="onUploadFilesSelected($event)" />
    }
  `,
  styles: [`
    .file-tree {
      display: flex;
      flex-direction: column;
      font-size: 0.875rem;
      color: var(--text-secondary);
      user-select: none;
    }

    .node-content {
      display: flex;
      align-items: center;
      padding-top: 4px;
      padding-bottom: 4px;
      padding-right: 8px;
      cursor: pointer;
      gap: 6px;
      border-radius: 4px;
      transition: background 0.1s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      &:hover {
        background: var(--panel-bg);
        color: var(--text-primary);
      }

      &.active {
        background: rgba(62, 207, 142, 0.1);
        color: var(--accent-color);
      }

      &.drop-target {
        background: rgba(62, 207, 142, 0.2);
        outline: 1px dashed var(--accent-color);
        outline-offset: -1px;
      }
    }

    .arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      transition: transform 0.2s;
      flex-shrink: 0;

      &.expanded {
        transform: rotate(90deg);
      }
    }

    .indent {
      width: 14px;
      flex-shrink: 0;
    }

    .icon {
      display: flex;
      align-items: center;
      flex-shrink: 0;

      &.folder { color: #eab308; }
      &.file { color: #64748b; }
    }

    .name {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .children {
      display: flex;
      flex-direction: column;
    }

    .inline-input {
      background: var(--panel-bg);
      border: 1px solid var(--accent-color);
      color: var(--text-primary);
      font-size: 0.875rem;
      padding: 1px 4px;
      border-radius: 3px;
      outline: none;
      min-width: 80px;
      font-family: inherit;
    }

    .inline-new {
      cursor: default;
    }

    .context-menu-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 999;
    }

    .context-menu {
      position: fixed;
      z-index: 1000;
      background: #1e1e2e;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 4px 0;
      min-width: 160px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);

      button {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 12px;
        border: none;
        background: none;
        color: var(--text-secondary);
        font-size: 0.8rem;
        cursor: pointer;
        text-align: left;

        &:hover {
          background: rgba(62, 207, 142, 0.1);
          color: var(--text-primary);
        }

        &.danger:hover {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }
      }
    }

    .menu-divider {
      height: 1px;
      background: #333;
      margin: 4px 0;
    }
  `]
})
export class FileExplorerComponent {
  state = inject(FileExplorerState);
  level = input(0);
  path = input('');
  files = input<any>(null);

  fileSelect = output<{name: string, path: string, content: string}>();
  fileAction = output<FileAction>();

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
