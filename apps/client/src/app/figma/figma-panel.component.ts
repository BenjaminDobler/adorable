import { Component, inject, signal, output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FigmaService, FigmaNodeInfo, FigmaPageInfo } from '../services/figma.service';
import { FigmaImportPayload } from '@adorable/shared-types';

@Component({
  selector: 'app-figma-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './figma-panel.component.html',
  styleUrls: ['./figma-panel.component.scss']
})
export class FigmaPanelComponent implements OnInit {
  figmaService = inject(FigmaService);

  importToChat = output<FigmaImportPayload>();

  // Local state
  figmaUrl = signal('');
  currentFileKey = signal<string | null>(null);
  error = signal<string | null>(null);
  expandedNodes = signal<Set<string>>(new Set());
  importing = signal(false);
  isDragging = signal(false);

  ngOnInit() {
    this.figmaService.checkStatus().subscribe();
  }

  get view(): 'setup' | 'input' | 'tree' {
    if (!this.figmaService.status().configured) {
      return 'setup';
    }
    if (!this.figmaService.currentFile()) {
      return 'input';
    }
    return 'tree';
  }

  loadFile() {
    const url = this.figmaUrl();
    if (!url) return;

    this.error.set(null);

    // Parse URL to get file key
    this.figmaService.parseUrl(url).subscribe({
      next: ({ fileKey }) => {
        this.currentFileKey.set(fileKey);
        this.figmaService.getFile(fileKey).subscribe({
          error: (err) => this.error.set(err.error?.error || 'Failed to load file')
        });
      },
      error: (err) => this.error.set(err.error?.error || 'Invalid Figma URL')
    });
  }

  goBack() {
    this.figmaService.clearFile();
    this.currentFileKey.set(null);
    this.error.set(null);
  }

  toggleExpand(nodeId: string) {
    const expanded = new Set(this.expandedNodes());
    if (expanded.has(nodeId)) {
      expanded.delete(nodeId);
    } else {
      expanded.add(nodeId);
    }
    this.expandedNodes.set(expanded);
  }

  isExpanded(nodeId: string): boolean {
    return this.expandedNodes().has(nodeId);
  }

  toggleSelect(nodeId: string) {
    this.figmaService.toggleNode(nodeId);
  }

  isSelected(nodeId: string): boolean {
    return this.figmaService.selectedNodes().has(nodeId);
  }

  selectAllInPage(page: FigmaPageInfo) {
    this.figmaService.selectAllInPage(page);
  }

  clearSelection() {
    this.figmaService.clearSelection();
  }

  get selectedCount(): number {
    return this.figmaService.selectedNodes().size;
  }

  async importSelected() {
    const file = this.figmaService.currentFile();
    const fileKey = this.currentFileKey();
    if (!file || !fileKey) return;

    const selectedIds = Array.from(this.figmaService.selectedNodes());
    if (selectedIds.length === 0) {
      this.error.set('Please select at least one frame or component');
      return;
    }

    this.importing.set(true);
    this.error.set(null);

    this.figmaService.importSelection(fileKey, selectedIds).subscribe({
      next: (payload) => {
        this.importing.set(false);
        this.importToChat.emit(payload);
      },
      error: (err) => {
        this.importing.set(false);
        this.error.set(err.error?.error || 'Failed to import');
      }
    });
  }

  hasChildren(node: FigmaNodeInfo): boolean {
    return !!node.children && node.children.length > 0;
  }

  getNodeIcon(type: string): string {
    switch (type) {
      case 'FRAME': return '⬜';
      case 'COMPONENT': return '◇';
      case 'COMPONENT_SET': return '◈';
      case 'GROUP': return '📁';
      case 'SECTION': return '📑';
      case 'INSTANCE': return '◆';
      default: return '▢';
    }
  }

  // File drop handling for plugin exports
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const file = event.dataTransfer?.files[0];
    if (file && file.name.endsWith('.json')) {
      this.processImportFile(file);
    } else {
      this.error.set('Please drop a valid .json export file');
    }
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.processImportFile(file);
    }
    // Reset input to allow selecting the same file again
    input.value = '';
  }

  private processImportFile(file: File) {
    this.error.set(null);
    this.importing.set(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const payload = JSON.parse(content) as FigmaImportPayload;

        // Validate the payload structure
        if (!payload.selection || !payload.imageDataUris || !payload.jsonStructure) {
          throw new Error('Invalid export file format');
        }

        console.log('[Figma Plugin Import] Loaded payload:', {
          fileName: payload.fileName,
          selectionCount: payload.selection.length,
          imageCount: payload.imageDataUris.length,
        });

        this.importing.set(false);
        this.importToChat.emit(payload);
      } catch (err) {
        console.error('Failed to parse Figma export file:', err);
        this.error.set('Failed to parse export file. Make sure it was exported from the Adorable Figma Plugin.');
        this.importing.set(false);
      }
    };

    reader.onerror = () => {
      this.error.set('Failed to read file');
      this.importing.set(false);
    };

    reader.readAsText(file);
  }
}
