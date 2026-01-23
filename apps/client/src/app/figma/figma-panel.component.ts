import { Component, inject, signal, output, OnInit, Input } from '@angular/core';
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
  importsChanged = output<FigmaImportPayload[]>();

  // Stored imports (persisted with project)
  @Input() set storedImports(imports: FigmaImportPayload[] | null) {
    if (imports && imports.length > 0) {
      this.importedPayloads.set(imports);
    }
  }

  // Local state
  figmaUrl = signal('');
  currentFileKey = signal<string | null>(null);
  error = signal<string | null>(null);
  expandedNodes = signal<Set<string>>(new Set());
  importing = signal(false);
  isDragging = signal(false);

  // Keep track of imported Figma data
  importedPayloads = signal<FigmaImportPayload[]>([]);
  selectedImportIndex = signal<number | null>(null);
  expandedImportNodes = signal<Set<string>>(new Set());
  hoveredNode = signal<any | null>(null);

  ngOnInit() {
    this.figmaService.checkStatus().subscribe();
  }

  get view(): 'setup' | 'input' | 'tree' | 'imports' {
    // Show imports view if we have stored imports and no active file loaded
    if (this.selectedImportIndex() !== null) {
      return 'imports';
    }
    if (!this.figmaService.status().configured && this.importedPayloads().length === 0) {
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
        this.storeAndEmitPayload(payload);
      },
      error: (err) => {
        this.importing.set(false);
        this.error.set(err.error?.error || 'Failed to import');
      }
    });
  }

  // Store payload and emit to chat
  private storeAndEmitPayload(payload: FigmaImportPayload) {
    // Add to stored imports (avoid duplicates by fileKey + selection)
    const existing = this.importedPayloads();
    const isDuplicate = existing.some(
      p => p.fileKey === payload.fileKey &&
           JSON.stringify(p.selection) === JSON.stringify(payload.selection)
    );
    if (!isDuplicate) {
      this.importedPayloads.update(payloads => [...payloads, payload]);
      this.importsChanged.emit(this.importedPayloads());
    }
    this.importToChat.emit(payload);
  }

  // View a stored import
  viewImport(index: number) {
    this.selectedImportIndex.set(index);
    this.expandedImportNodes.set(new Set());
  }

  // Close imports view
  closeImportsView() {
    this.selectedImportIndex.set(null);
  }

  // Re-use a stored import (send to chat again)
  reuseImport(index: number) {
    const payload = this.importedPayloads()[index];
    if (payload) {
      this.importToChat.emit(payload);
    }
  }

  // Delete a stored import
  deleteImport(index: number, event: Event) {
    event.stopPropagation();
    this.importedPayloads.update(payloads => payloads.filter((_, i) => i !== index));
    this.importsChanged.emit(this.importedPayloads());
    if (this.selectedImportIndex() === index) {
      this.selectedImportIndex.set(null);
    }
  }

  // Toggle expand in imports tree view
  toggleImportNodeExpand(nodeId: string) {
    const expanded = new Set(this.expandedImportNodes());
    if (expanded.has(nodeId)) {
      expanded.delete(nodeId);
    } else {
      expanded.add(nodeId);
    }
    this.expandedImportNodes.set(expanded);
  }

  isImportNodeExpanded(nodeId: string): boolean {
    return this.expandedImportNodes().has(nodeId);
  }

  // Get the currently selected import
  get selectedImport(): FigmaImportPayload | null {
    const index = this.selectedImportIndex();
    if (index === null) return null;
    return this.importedPayloads()[index] || null;
  }

  // Get nodes from jsonStructure for tree display
  getImportNodes(payload: FigmaImportPayload): any[] {
    if (!payload.jsonStructure) return [];
    // jsonStructure is keyed by node ID
    return Object.entries(payload.jsonStructure).map(([id, data]: [string, any]) => ({
      id,
      name: data?.document?.name || id,
      type: data?.document?.type || 'UNKNOWN',
      children: data?.document?.children || [],
      document: data?.document
    }));
  }

  // Get thumbnail for a specific node (match by index in selection)
  getNodeThumbnail(nodeId: string, payload: FigmaImportPayload): string | null {
    const selectionIndex = payload.selection.findIndex(s => s.nodeId === nodeId);
    if (selectionIndex >= 0 && payload.imageDataUris[selectionIndex]) {
      return payload.imageDataUris[selectionIndex];
    }
    return null;
  }

  // Select a specific layer to use in chat (with cropped image)
  async useLayerInChat(node: any, payload: FigmaImportPayload, event: Event) {
    event.stopPropagation();

    // Find the parent frame that contains this node
    const parentInfo = this.findParentFrame(node, payload);
    if (!parentInfo) {
      this.error.set('Could not find parent frame for this layer');
      return;
    }

    const { parentImage, parentBounds } = parentInfo;
    const nodeBounds = node.absoluteBoundingBox;

    if (!nodeBounds || !parentBounds) {
      // No bounds info, just send the structure without an image
      this.emitLayerToChat(node, payload, null);
      return;
    }

    // Calculate relative position within parent
    const relX = nodeBounds.x - parentBounds.x;
    const relY = nodeBounds.y - parentBounds.y;

    // Crop the image
    try {
      const croppedImage = await this.cropImage(
        parentImage,
        relX, relY,
        nodeBounds.width, nodeBounds.height,
        parentBounds.width, parentBounds.height
      );
      this.emitLayerToChat(node, payload, croppedImage);
    } catch (e) {
      console.error('Failed to crop image:', e);
      this.emitLayerToChat(node, payload, null);
    }
  }

  private findParentFrame(node: any, payload: FigmaImportPayload): { parentNodeId: string, parentImage: string, parentBounds: any } | null {
    // Check each selection to find which one contains this node
    for (let i = 0; i < payload.selection.length; i++) {
      const sel = payload.selection[i];
      const frameData = payload.jsonStructure[sel.nodeId];
      if (!frameData?.document) continue;

      // Check if this node is the frame itself
      if (node.id === sel.nodeId) {
        return {
          parentNodeId: sel.nodeId,
          parentImage: payload.imageDataUris[i],
          parentBounds: frameData.document.absoluteBoundingBox
        };
      }

      // Check if node is a descendant of this frame
      if (this.isDescendant(node.id, frameData.document)) {
        return {
          parentNodeId: sel.nodeId,
          parentImage: payload.imageDataUris[i],
          parentBounds: frameData.document.absoluteBoundingBox
        };
      }
    }
    return null;
  }

  private isDescendant(nodeId: string, parent: any): boolean {
    if (!parent.children) return false;
    for (const child of parent.children) {
      if (child.id === nodeId) return true;
      if (this.isDescendant(nodeId, child)) return true;
    }
    return false;
  }

  private async cropImage(
    imageDataUri: string,
    x: number, y: number,
    width: number, height: number,
    parentWidth: number, parentHeight: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Calculate scale (image might be rendered at different size than bounds)
        const scaleX = img.width / parentWidth;
        const scaleY = img.height / parentHeight;

        const canvas = document.createElement('canvas');
        canvas.width = width * scaleX;
        canvas.height = height * scaleY;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(
          img,
          x * scaleX, y * scaleY,           // Source position
          width * scaleX, height * scaleY,  // Source size
          0, 0,                             // Dest position
          canvas.width, canvas.height       // Dest size
        );

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageDataUri;
    });
  }

  private emitLayerToChat(node: any, originalPayload: FigmaImportPayload, croppedImage: string | null) {
    // Create a mini payload for just this layer
    const layerPayload: FigmaImportPayload = {
      fileKey: originalPayload.fileKey,
      fileName: `${originalPayload.fileName} > ${node.name}`,
      selection: [{
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type
      }],
      jsonStructure: {
        [node.id]: { document: node }
      },
      imageDataUris: croppedImage ? [croppedImage] : []
    };

    this.importToChat.emit(layerPayload);
  }

  // Check if a node can be selected (has bounds)
  canSelectLayer(node: any): boolean {
    return !!node.absoluteBoundingBox;
  }

  // Hover handling for layer highlight
  onLayerHover(node: any | null) {
    this.hoveredNode.set(node);
  }

  // Get highlight style for the hovered node overlay
  getHighlightStyle(payload: FigmaImportPayload, imageElement: HTMLImageElement | null): any {
    const node = this.hoveredNode();
    if (!node || !node.absoluteBoundingBox || !imageElement) {
      return { display: 'none' };
    }

    // Find parent frame
    const parentInfo = this.findParentFrame(node, payload);
    if (!parentInfo || !parentInfo.parentBounds) {
      return { display: 'none' };
    }

    const parentBounds = parentInfo.parentBounds;
    const nodeBounds = node.absoluteBoundingBox;

    // Calculate relative position within parent
    const relX = nodeBounds.x - parentBounds.x;
    const relY = nodeBounds.y - parentBounds.y;

    // Calculate percentages for responsive positioning
    const leftPercent = (relX / parentBounds.width) * 100;
    const topPercent = (relY / parentBounds.height) * 100;
    const widthPercent = (nodeBounds.width / parentBounds.width) * 100;
    const heightPercent = (nodeBounds.height / parentBounds.height) * 100;

    return {
      display: 'block',
      left: `${leftPercent}%`,
      top: `${topPercent}%`,
      width: `${widthPercent}%`,
      height: `${heightPercent}%`
    };
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
        this.storeAndEmitPayload(payload);
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
