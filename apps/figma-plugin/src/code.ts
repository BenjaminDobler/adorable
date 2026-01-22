// Adorable Figma Export Plugin
// Exports selected frames as JSON + images for use with Adorable AI App Generator

// Show the UI
figma.showUI(__html__, { width: 360, height: 480 });

// Types matching the Adorable app's FigmaImportPayload
interface ExportPayload {
  fileKey: string;
  fileName: string;
  selection: Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
  }>;
  jsonStructure: Record<string, NodeWrapper>;
  imageDataUris: string[];
}

interface NodeWrapper {
  document: NodeStructure;
}

interface NodeStructure {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  children?: NodeStructure[];
  fills?: readonly Paint[];
  strokes?: readonly Paint[];
  effects?: readonly Effect[];
  cornerRadius?: number;
  opacity?: number;
  visible?: boolean;
}

// Extract node structure recursively
function extractNodeStructure(node: SceneNode, depth = 0): NodeStructure {
  const structure: NodeStructure = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  // Add bounding box if available
  if ('absoluteBoundingBox' in node && node.absoluteBoundingBox) {
    structure.absoluteBoundingBox = {
      x: node.absoluteBoundingBox.x,
      y: node.absoluteBoundingBox.y,
      width: node.absoluteBoundingBox.width,
      height: node.absoluteBoundingBox.height,
    };
  }

  // Add visual properties if available
  if ('fills' in node) {
    structure.fills = node.fills as readonly Paint[];
  }
  if ('strokes' in node) {
    structure.strokes = node.strokes as readonly Paint[];
  }
  if ('effects' in node) {
    structure.effects = node.effects as readonly Effect[];
  }
  if ('cornerRadius' in node && typeof node.cornerRadius === 'number') {
    structure.cornerRadius = node.cornerRadius;
  }
  if ('opacity' in node) {
    structure.opacity = node.opacity;
  }
  structure.visible = node.visible;

  // Recursively extract children (limit depth to avoid huge exports)
  if ('children' in node && depth < 10) {
    structure.children = node.children.map((child) => extractNodeStructure(child, depth + 1));
  }

  return structure;
}

// Export a node as PNG and return base64
async function exportNodeAsImage(node: SceneNode, scale = 2): Promise<string | null> {
  try {
    const settings: ExportSettingsImage = {
      format: 'PNG',
      constraint: { type: 'SCALE', value: scale },
    };
    const bytes = await node.exportAsync(settings);

    // Convert Uint8Array to base64
    const base64 = figma.base64Encode(bytes);
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error(`Failed to export node ${node.name}:`, error);
    return null;
  }
}

// Main export function
async function exportSelection(scale = 2): Promise<ExportPayload | null> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'error', message: 'Please select at least one frame or component' });
    return null;
  }

  figma.ui.postMessage({ type: 'status', message: `Exporting ${selection.length} item(s)...` });

  const payload: ExportPayload = {
    fileKey: figma.fileKey || 'local-file',
    fileName: figma.root.name,
    selection: [],
    jsonStructure: {},
    imageDataUris: [],
  };

  for (let i = 0; i < selection.length; i++) {
    const node = selection[i];

    figma.ui.postMessage({
      type: 'progress',
      current: i + 1,
      total: selection.length,
      message: `Processing "${node.name}"...`,
    });

    // Add to selection list
    payload.selection.push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
    });

    // Extract structure
    const structure = extractNodeStructure(node);
    payload.jsonStructure[node.id] = {
      document: structure,
    };

    // Export image
    const imageDataUri = await exportNodeAsImage(node, scale);
    if (imageDataUri) {
      payload.imageDataUris.push(imageDataUri);
    }
  }

  figma.ui.postMessage({ type: 'status', message: 'Export complete!' });
  return payload;
}

// Handle messages from UI
figma.ui.onmessage = async (msg: { type: string; scale?: number }) => {
  if (msg.type === 'export') {
    const scale = msg.scale || 2;
    const payload = await exportSelection(scale);

    if (payload) {
      figma.ui.postMessage({ type: 'download', payload });
    }
  } else if (msg.type === 'cancel') {
    figma.closePlugin();
  } else if (msg.type === 'get-selection') {
    // Send current selection info to UI
    const selection = figma.currentPage.selection;
    figma.ui.postMessage({
      type: 'selection-info',
      count: selection.length,
      items: selection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
    });
  }
};

// Listen for selection changes
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    type: 'selection-info',
    count: selection.length,
    items: selection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
  });
});

// Send initial selection info
const initialSelection = figma.currentPage.selection;
figma.ui.postMessage({
  type: 'selection-info',
  count: initialSelection.length,
  items: initialSelection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
});
