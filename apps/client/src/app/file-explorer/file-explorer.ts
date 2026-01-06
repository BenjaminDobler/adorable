import { Component, Input, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
  expanded?: boolean;
  originalData?: any;
}

@Component({
  selector: 'app-file-explorer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="file-tree">
      @for (node of nodes(); track node.name) {
        <div class="tree-node">
          <div class="node-content" 
               [class.active]="selectedFile() === node.name"
               [style.padding-left.px]="level * 12 + 8"
               (click)="toggleNode(node)">
            
            @if (node.type === 'folder') {
              <span class="arrow" [class.expanded]="node.expanded">
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
            
            <span class="name">{{ node.name }}</span>
          </div>

          @if (node.type === 'folder' && node.expanded) {
            <div class="children">
              <app-file-explorer 
                [files]="node.originalData" 
                [level]="level + 1"
                (fileSelect)="onChildFileSelect($event)">
              </app-file-explorer>
            </div>
          }
        </div>
      }
    </div>
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
  `]
})
export class FileExplorerComponent {
  @Input() level = 0;
  @Output() fileSelect = new EventEmitter<{name: string, content: string}>();
  
  nodes = signal<FileNode[]>([]);
  selectedFile = signal<string | null>(null);

  @Input() set files(value: any) {
    if (value) {
      this.nodes.set(this.transformFiles(value));
    }
  }

  transformFiles(files: any): FileNode[] {
    const nodes: FileNode[] = [];
    const entries = Object.entries(files).sort((a: any, b: any) => {
      const aIsDir = !!a[1].directory;
      const bIsDir = !!b[1].directory;
      if (aIsDir === bIsDir) return a[0].localeCompare(b[0]);
      return aIsDir ? -1 : 1;
    });

    for (const [name, content] of entries) {
      const node: any = content;
      nodes.push({
        name,
        type: node.directory ? 'folder' : 'file',
        expanded: false,
        content: node.file?.contents,
        originalData: node.directory
      });
    }
    return nodes;
  }

  toggleNode(node: FileNode) {
    if (node.type === 'folder') {
      node.expanded = !node.expanded;
      // Trigger change detection implicitly via the template binding
    } else {
      this.selectedFile.set(node.name);
      this.fileSelect.emit({
        name: node.name,
        content: node.content || ''
      });
    }
  }

  onChildFileSelect(event: {name: string, content: string}) {
    this.fileSelect.emit(event);
  }
}