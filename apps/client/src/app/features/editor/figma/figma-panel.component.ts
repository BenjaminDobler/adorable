import { Component, inject, signal, output, input, effect, computed, OnInit, OnDestroy } from '@angular/core';
import { DecimalPipe, KeyValuePipe, NgStyle, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FigmaService, FigmaNodeInfo, FigmaPageInfo } from '../../../core/services/figma.service';
import { FigmaBridgeService } from '../../../core/services/figma-bridge.service';
import { FigmaImportPayload, FigmaVariablesPayload } from '@adorable/shared-types';

@Component({
  selector: 'app-figma-panel',
  standalone: true,
  imports: [DecimalPipe, KeyValuePipe, NgStyle, NgTemplateOutlet, FormsModule],
  templateUrl: './figma-panel.component.html',
  styleUrls: ['./figma-panel.component.scss']
})
export class FigmaPanelComponent implements OnInit, OnDestroy {
  figmaService = inject(FigmaService);
  figmaBridge = inject(FigmaBridgeService);

  importToChat = output<FigmaImportPayload>();
  importsChanged = output<FigmaImportPayload[]>();

  // Stored imports (persisted with project)
  storedImports = input<FigmaImportPayload[] | null>(null);

  // Live bridge state
  grabbingSelection = signal(false);
  copiedCode = signal(false);
  pullingTokens = signal(false);
  tokensResult = signal<FigmaVariablesPayload | null>(null);

  constructor() {
    effect(() => {
      const imports = this.storedImports();
      if (imports && imports.length > 0) {
        this.importedPayloads.set(imports);
      }
    });
    // Check Figma status on init
    this.figmaService.checkStatus().subscribe();
  }

  ngOnInit() {
    this.figmaBridge.checkStatus();
    this.figmaBridge.startListening();
  }

  ngOnDestroy() {
    this.figmaBridge.stopListening();
  }

  generateBridgeCode() {
    this.figmaBridge.generateConnectionCode();
  }

  /**
   * Unique Figma files used to build this project, derived from stored imports.
   */
  figmaSources = computed(() => {
    const imports = this.importedPayloads();
    const map = new Map<string, { fileKey: string; fileName: string }>();
    for (const p of imports) {
      if (p.fileKey && !map.has(p.fileKey)) {
        map.set(p.fileKey, { fileKey: p.fileKey, fileName: p.fileName || p.fileKey });
      }
    }
    return Array.from(map.values());
  });

  /**
   * Build a Figma file URL from a fileKey + name.
   */
  private figmaFileUrl(fileKey: string, fileName: string): string {
    const slug = (fileName || 'file')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'file';
    return `https://www.figma.com/file/${fileKey}/${slug}`;
  }

  /**
   * Open the given Figma file in a new tab.
   */
  openInFigma(fileKey: string, fileName: string) {
    window.open(this.figmaFileUrl(fileKey, fileName), '_blank', 'noopener');
  }

  /**
   * Open the Figma file AND initiate the Live Bridge connection code.
   * The code is copied to the clipboard so the user can paste it into
   * the Adorable plugin once Figma opens.
   */
  async connectFigmaSource(fileKey: string, fileName: string) {
    // Only generate a code if we don't already have one
    if (!this.figmaBridge.connectionCode() && !this.figmaBridge.connected()) {
      this.figmaBridge.generateConnectionCode();
    }
    // Open the file in a new tab
    this.openInFigma(fileKey, fileName);
  }

  /**
   * Copy the current bridge connection code to clipboard.
   */
  async copyConnectionCode() {
    const code = this.figmaBridge.connectionCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copiedCode.set(true);
      setTimeout(() => this.copiedCode.set(false), 1500);
    } catch { /* ignore clipboard errors */ }
  }

  isSourceConnected(fileKey: string): boolean {
    return this.figmaBridge.connected() && this.figmaBridge.fileKey() === fileKey;
  }

  pullTokens() {
    this.pullingTokens.set(true);
    this.tokensResult.set(null);
    this.figmaBridge.getVariables().subscribe({
      next: (result) => {
        this.tokensResult.set(result);
        this.pullingTokens.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to pull design tokens');
        this.pullingTokens.set(false);
      },
    });
  }

  dismissTokens() {
    this.tokensResult.set(null);
  }

  copiedTokensCss = signal(false);

  /**
   * Convert a Figma variable name (e.g. "color/brand/primary") into a CSS
   * custom property name (e.g. "--color-brand-primary").
   */
  private toCssVarName(name: string): string {
    const kebab = name
      .replace(/[\/\s_]+/g, '-')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `--${kebab || 'token'}`;
  }

  /**
   * Build CSS for the pulled tokens. Emits `:root` for the default mode and a
   * `[data-theme="<mode>"]` selector for every additional mode per collection.
   */
  private buildTokensCss(): string {
    const tokens = this.tokensResult();
    if (!tokens || tokens.tokens.length === 0) return '';

    // Group by collection → mode → token
    const byCollection = new Map<string, { defaultMode: string; modes: Set<string> }>();
    for (const coll of tokens.collections) {
      byCollection.set(coll.name, { defaultMode: coll.defaultMode, modes: new Set(coll.modes) });
    }

    // For each mode, collect tokens that have a value in it
    // Default mode goes into :root, other modes into [data-theme="mode"]
    const modeGroups = new Map<string, string[]>();
    modeGroups.set(':root', []);

    for (const token of tokens.tokens) {
      const coll = byCollection.get(token.collection);
      const defaultMode = coll?.defaultMode;
      const varName = this.toCssVarName(token.name);

      for (const [modeName, value] of Object.entries(token.valuesByMode)) {
        const cssValue = typeof value === 'number' && token.type === 'FLOAT'
          ? `${this.formatTokenValue(value)}px` // best-guess unit for numeric tokens
          : this.formatTokenValue(value);
        const line = `  ${varName}: ${cssValue};`;

        const selector = modeName === defaultMode ? ':root' : `[data-theme="${modeName}"]`;
        if (!modeGroups.has(selector)) modeGroups.set(selector, []);
        modeGroups.get(selector)!.push(line);
      }
    }

    const sections: string[] = [];
    for (const [selector, lines] of modeGroups) {
      if (lines.length === 0) continue;
      sections.push(`${selector} {\n${lines.join('\n')}\n}`);
    }
    return `/* Design tokens extracted from Figma: ${tokens.fileName} */\n` + sections.join('\n\n');
  }

  async copyTokensAsCss() {
    const css = this.buildTokensCss();
    if (!css) return;
    try {
      await navigator.clipboard.writeText(css);
      this.copiedTokensCss.set(true);
      setTimeout(() => this.copiedTokensCss.set(false), 1500);
    } catch { /* ignore */ }
  }

  tokensByCollection = computed(() => {
    const result = this.tokensResult();
    if (!result) return [];
    const groups = new Map<string, FigmaVariablesPayload['tokens']>();
    for (const token of result.tokens) {
      const arr = groups.get(token.collection) || [];
      arr.push(token);
      groups.set(token.collection, arr);
    }
    return Array.from(groups.entries()).map(([name, tokens]) => ({ name, tokens }));
  });

  formatTokenValue(value: string | number | boolean): string {
    if (typeof value === 'number') {
      // Trim trailing zeros for common token values
      return String(Number(value.toFixed(3)));
    }
    return String(value);
  }

  isColorToken(value: string | number | boolean): boolean {
    if (typeof value !== 'string') return false;
    return value.startsWith('#') || value.startsWith('rgba(') || value.startsWith('rgb(');
  }

  toggleFigmaAnnotations() {
    this.figmaBridge.nodeAnnotations.update(v => !v);
  }

  grabFigmaSelection() {
    this.grabbingSelection.set(true);
    this.figmaBridge.grabSelection().subscribe({
      next: (payload) => {
        this.storePayload(payload);
        this.grabbingSelection.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to grab Figma selection');
        this.grabbingSelection.set(false);
      }
    });
  }

  useFigmaSelectionInChat() {
    this.grabbingSelection.set(true);
    this.figmaBridge.grabSelection().subscribe({
      next: (payload) => {
        this.storePayload(payload);
        this.importToChat.emit(payload);
        this.grabbingSelection.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to grab Figma selection');
        this.grabbingSelection.set(false);
      }
    });
  }

  // Local state
  figmaUrl = signal('');
  currentFileKey = signal<string | null>(null);
  error = signal<string | null>(null);
  expandedNodes = signal<Set<string>>(new Set());
  importing = signal(false);
  isDragging = signal(false);

  // Node-URL import flow
  pendingNode = signal<{ fileKey: string; nodeId: string; name: string; type: string } | null>(null);
  pendingNodeLoading = signal(false);

  // Keep track of imported Figma data
  importedPayloads = signal<FigmaImportPayload[]>([]);
  selectedImportIndex = signal<number | null>(null);
  expandedImportNodes = signal<Set<string>>(new Set());
  hoveredNode = signal<any | null>(null);

  view = computed<'setup' | 'input' | 'tree' | 'imports' | 'node-preview'>(() => {
    if (this.selectedImportIndex() !== null) {
      return 'imports';
    }
    if (!this.figmaService.status().configured && this.importedPayloads().length === 0) {
      return 'setup';
    }
    if (this.pendingNode() !== null) {
      return 'node-preview';
    }
    if (!this.figmaService.currentFile()) {
      return 'input';
    }
    return 'tree';
  });

  loadFile() {
    const url = this.figmaUrl();
    if (!url) return;

    this.error.set(null);

    // Extract node-id from URL if present (Figma uses "-" separator, API uses ":")
    const nodeIdMatch = url.match(/[?&]node-id=([^&]+)/);
    const nodeId = nodeIdMatch ? nodeIdMatch[1].replace(/-/g, ':') : null;

    this.figmaService.parseUrl(url).subscribe({
      next: ({ fileKey }) => {
        this.currentFileKey.set(fileKey);

        if (nodeId) {
          // Node-URL flow: fetch just this node's metadata
          this.pendingNodeLoading.set(true);
          this.figmaService.getNodes(fileKey, [nodeId]).subscribe({
            next: (result: any) => {
              this.pendingNodeLoading.set(false);
              // Figma nodes response: { nodes: { [nodeId]: { document: { name, type, ... } } } }
              const nodeData = result?.nodes?.[nodeId]?.document;
              this.pendingNode.set({
                fileKey,
                nodeId,
                name: nodeData?.name || nodeId,
                type: nodeData?.type || 'UNKNOWN'
              });
            },
            error: (err) => {
              this.pendingNodeLoading.set(false);
              this.error.set(err.error?.error || 'Node not found in this file');
            }
          });
        } else {
          // Normal flow: load full file tree
          this.figmaService.getFile(fileKey).subscribe({
            error: (err) => this.error.set(err.error?.error || 'Failed to load file')
          });
        }
      },
      error: (err) => this.error.set(err.error?.error || 'Invalid Figma URL')
    });
  }

  importPendingNode() {
    const node = this.pendingNode();
    if (!node) return;

    this.importing.set(true);
    this.error.set(null);

    this.figmaService.importSelection(node.fileKey, [node.nodeId]).subscribe({
      next: (payload) => {
        this.importing.set(false);
        this.pendingNode.set(null);
        // Tag the payload with its source node ID
        const taggedPayload = { ...payload, sourceNodeId: node.nodeId };
        this.storePayload(taggedPayload);
      },
      error: (err) => {
        this.importing.set(false);
        this.error.set(err.error?.error || 'Failed to import node');
      }
    });
  }

  showFullTree() {
    const node = this.pendingNode();
    if (!node) return;
    this.pendingNode.set(null);
    this.error.set(null);
    this.figmaService.getFile(node.fileKey).subscribe({
      error: (err) => this.error.set(err.error?.error || 'Failed to load file')
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

  selectedCount = computed(() => this.figmaService.selectedNodes().size);

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
        this.storePayload(payload);
      },
      error: (err) => {
        this.importing.set(false);
        this.error.set(err.error?.error || 'Failed to import');
      }
    });
  }

  // Store payload and navigate to import preview (no emit to chat)
  storePayload(payload: FigmaImportPayload) {
    // Add to stored imports (avoid duplicates by fileKey + selection)
    const existing = this.importedPayloads();
    const duplicateIndex = existing.findIndex(
      p => p.fileKey === payload.fileKey &&
           JSON.stringify(p.selection) === JSON.stringify(payload.selection)
    );
    if (duplicateIndex === -1) {
      this.importedPayloads.update(payloads => [...payloads, payload]);
      this.importsChanged.emit(this.importedPayloads());
      // Navigate to the newly added import's detail view
      this.selectedImportIndex.set(this.importedPayloads().length - 1);
    } else {
      // Navigate to the existing duplicate's detail view
      this.selectedImportIndex.set(duplicateIndex);
    }
    this.expandedImportNodes.set(new Set());
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

  selectedImport = computed(() => {
    const index = this.selectedImportIndex();
    if (index === null) return null;
    return this.importedPayloads()[index] || null;
  });

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
      case 'GROUP': return '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
      case 'SECTION': return '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>';
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
        this.storePayload(payload);
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
