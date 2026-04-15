// Adorable Figma Export Plugin
// Exports selected frames as JSON + images for use with Adorable AI App Generator

// Show the UI — works in both Design mode (floating window) and Dev mode (inspect panel)
if (figma.editorType === 'dev') {
  // Dev mode: show as inspect panel in the right sidebar
  figma.showUI(__html__, { width: 360, height: 580, position: { x: 0, y: 0 }, themeColors: true });
} else {
  // Design mode: show as floating window
  figma.showUI(__html__, { width: 360, height: 580 });
}

const BRIDGE_TOKEN_KEY = 'adorable-bridge-token';
const BRIDGE_URL_KEY = 'adorable-bridge-url';

// On startup, load the persisted bridge URL override and token, send to UI.
figma.clientStorage.getAsync(BRIDGE_URL_KEY).then((url) => {
  figma.ui.postMessage({ type: 'init-bridge-url', url: url || null });
});
figma.clientStorage.getAsync(BRIDGE_TOKEN_KEY).then((token) => {
  figma.ui.postMessage({ type: 'init-bridge-token', token: token || null });
});

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
  // Typography (TEXT nodes only)
  fontName?: { family: string; style: string };
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: any;
  letterSpacing?: any;
  textAlignHorizontal?: string;
  characters?: string;
  // Icon detection: hex codepoint for single-glyph icon font characters
  iconCodepoint?: string;
  isIconFont?: boolean;
}

// Extract node structure recursively
function extractNodeStructure(node: SceneNode, depth = 0, maxDepth = 10): NodeStructure {
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

  // Typography properties for TEXT nodes
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    // fontName/fontSize can be Symbol(figma.mixed) for mixed styles; only extract if uniform
    if (textNode.fontName !== figma.mixed) {
      structure.fontName = { family: textNode.fontName.family, style: textNode.fontName.style };
    }
    if (textNode.fontSize !== figma.mixed) {
      structure.fontSize = textNode.fontSize as number;
    }
    if (textNode.fontWeight !== figma.mixed) {
      structure.fontWeight = textNode.fontWeight as number;
    }
    if (textNode.lineHeight !== figma.mixed) {
      structure.lineHeight = textNode.lineHeight;
    }
    if (textNode.letterSpacing !== figma.mixed) {
      structure.letterSpacing = textNode.letterSpacing;
    }
    structure.textAlignHorizontal = textNode.textAlignHorizontal;
    structure.characters = textNode.characters;

    // Icon font detection: if the text is 1-2 characters and contains a non-Latin
    // glyph (codepoint > 0xFF), it's almost certainly an icon font glyph.
    // Extract the hex codepoint so consumers can map it to a CSS class or content value.
    if (textNode.characters.length <= 2 && textNode.characters.length > 0) {
      var cp = textNode.characters.codePointAt(0);
      if (cp && cp > 0xFF) {
        structure.iconCodepoint = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
        structure.isIconFont = true;
      }
    }
  }

  // Recursively extract children (limit depth to avoid huge exports)
  if ('children' in node && depth < maxDepth) {
    structure.children = node.children.map((child) => extractNodeStructure(child, depth + 1, maxDepth));
  }

  return structure;
}

// Export a node as PNG or SVG and return base64 data URI (PNG) or raw SVG string
async function exportNodeAsImage(node: SceneNode, scale = 2, format: 'PNG' | 'SVG' = 'PNG'): Promise<string | null> {
  try {
    if (format === 'SVG') {
      var svgSettings: ExportSettingsSVG = { format: 'SVG' };
      var svgBytes = await node.exportAsync(svgSettings);
      // SVG bytes are UTF-8 text
      var svgString = '';
      for (var i = 0; i < svgBytes.length; i++) {
        svgString += String.fromCharCode(svgBytes[i]);
      }
      return svgString;
    }
    var pngSettings: ExportSettingsImage = {
      format: 'PNG',
      constraint: { type: 'SCALE', value: scale },
    };
    var bytes = await node.exportAsync(pngSettings);
    var base64 = figma.base64Encode(bytes);
    return 'data:image/png;base64,' + base64;
  } catch (error) {
    console.error('Failed to export node ' + node.name + ':', error);
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
figma.ui.onmessage = async (msg: { type: string; scale?: number; requestId?: string; command?: any; token?: string; url?: string | null }) => {
  if (msg.type === 'save-bridge-token') {
    await figma.clientStorage.setAsync(BRIDGE_TOKEN_KEY, msg.token || '');
    return;
  } else if (msg.type === 'clear-bridge-token') {
    await figma.clientStorage.deleteAsync(BRIDGE_TOKEN_KEY);
    return;
  } else if (msg.type === 'save-bridge-url') {
    if (msg.url) {
      await figma.clientStorage.setAsync(BRIDGE_URL_KEY, msg.url);
    } else {
      await figma.clientStorage.deleteAsync(BRIDGE_URL_KEY);
    }
    return;
  } else if (msg.type === 'export') {
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
  } else if (msg.type === 'bridge-command') {
    // Handle commands from Adorable via WebSocket bridge
    const { requestId, command } = msg;
    let responseData: any = null;
    let error: string | undefined;

    try {
      switch (command.action) {
        case 'get_selection': {
          const sel = figma.currentPage.selection;
          const nodes = sel.map((n) => extractNodeStructure(n));
          const jsonStructure: Record<string, NodeWrapper> = {};
          for (const n of sel) {
            jsonStructure[n.id] = { document: extractNodeStructure(n) };
          }
          responseData = {
            fileKey: figma.fileKey || 'local-file',
            fileName: figma.root.name,
            nodes: sel.map((n) => ({ id: n.id, name: n.name, type: n.type })),
            jsonStructure,
          };
          break;
        }

        case 'get_node': {
          const maxDepth = typeof command.depth === 'number' ? command.depth : 10;
          const node = await figma.getNodeByIdAsync(command.nodeId);
          if (node && 'type' in node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
            responseData = {
              node: extractNodeStructure(node as SceneNode, 0, maxDepth),
            };
          } else {
            error = `Node not found: ${command.nodeId}`;
          }
          break;
        }

        case 'export_node': {
          const node = await figma.getNodeByIdAsync(command.nodeId);
          if (node && 'exportAsync' in node) {
            var exportFormat = (command.format === 'SVG') ? 'SVG' as const : 'PNG' as const;
            var exported = await exportNodeAsImage(node as SceneNode, command.scale || 2, exportFormat);
            if (exportFormat === 'SVG') {
              responseData = { svg: exported, format: 'SVG' };
            } else {
              responseData = { image: exported, format: 'PNG' };
            }
          } else {
            error = 'Node not found or not exportable: ' + command.nodeId;
          }
          break;
        }

        case 'select_node': {
          const node = await figma.getNodeByIdAsync(command.nodeId);
          if (node && 'type' in node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
            figma.currentPage.selection = [node as SceneNode];
            figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
            responseData = { success: true, nodeName: node.name };
          } else {
            error = `Node not found: ${command.nodeId}`;
          }
          break;
        }

        case 'scroll_to_node': {
          const node = await figma.getNodeByIdAsync(command.nodeId);
          if (node) {
            figma.viewport.scrollAndZoomIntoView([node]);
            responseData = { success: true };
          } else {
            error = `Node not found: ${command.nodeId}`;
          }
          break;
        }

        case 'get_variables': {
          // Extract local variables as design tokens, resolved per mode.
          const collections = await figma.variables.getLocalVariableCollectionsAsync();
          const variables = await figma.variables.getLocalVariablesAsync();

          const collectionSummary = collections.map((c) => {
            const defaultModeObj = c.modes.find((m) => m.modeId === c.defaultModeId);
            const fallbackModeName = c.modes[0] ? c.modes[0].name : '';
            return {
              id: c.id,
              name: c.name,
              modes: c.modes.map((m) => m.name),
              defaultMode: defaultModeObj ? defaultModeObj.name : fallbackModeName,
            };
          });

          // Helper: resolve a VariableValue to a primitive, chasing aliases
          const resolveValue = async (
            value: any,
            resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN',
            seen = new Set<string>()
          ): Promise<string | number | boolean> => {
            if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
              if (seen.has(value.id)) return '[circular]';
              seen.add(value.id);
              const aliased = await figma.variables.getVariableByIdAsync(value.id);
              if (!aliased) return '[missing]';
              // Resolve using aliased variable's default mode
              const aliasedCollection = await figma.variables.getVariableCollectionByIdAsync(aliased.variableCollectionId);
              const modeId = (aliasedCollection && aliasedCollection.defaultModeId) || Object.keys(aliased.valuesByMode)[0];
              return resolveValue(aliased.valuesByMode[modeId], resolvedType, seen);
            }
            if (resolvedType === 'COLOR' && value && typeof value === 'object' && 'r' in value) {
              const r = Math.round(value.r * 255);
              const g = Math.round(value.g * 255);
              const b = Math.round(value.b * 255);
              const a = value.a != null ? value.a : 1;
              if (a < 1) {
                return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
              }
              const hex = (n: number) => n.toString(16).padStart(2, '0');
              return `#${hex(r)}${hex(g)}${hex(b)}`;
            }
            return value as string | number | boolean;
          };

          const tokens: any[] = [];
          for (const v of variables) {
            const collection = collections.find((c) => c.id === v.variableCollectionId);
            if (!collection) continue;
            const valuesByMode: Record<string, string | number | boolean> = {};
            for (const mode of collection.modes) {
              const raw = v.valuesByMode[mode.modeId];
              if (raw === undefined) continue;
              valuesByMode[mode.name] = await resolveValue(raw, v.resolvedType as any);
            }
            tokens.push({
              id: v.id,
              name: v.name,
              type: v.resolvedType,
              collection: collection.name,
              valuesByMode,
              description: v.description || undefined,
              scopes: v.scopes as string[] | undefined,
            });
          }

          responseData = {
            fileKey: figma.fileKey || 'local-file',
            fileName: figma.root.name,
            collections: collectionSummary,
            tokens,
          };
          break;
        }

        case 'get_fonts': {
          // Scan all TEXT nodes in the current page and return unique font families
          // with their styles and usage context (icon font vs text font).
          var textNodes = figma.currentPage.findAll(function(n) { return n.type === 'TEXT'; }) as TextNode[];
          var fontMap: Record<string, { family: string; styles: Set<string>; isIconFont: boolean; sampleChars: string[] }> = {};

          // Known icon font family patterns
          var iconFontPatterns = [
            'la-solid', 'la-regular', 'la-brands', 'line awesome',
            'font awesome', 'fa-solid', 'fa-regular', 'fa-brands',
            'material icons', 'material symbols',
            'ionicons', 'feather', 'phosphor', 'tabler',
            'remixicon', 'boxicons', 'bootstrap-icons',
          ];

          for (var ti = 0; ti < textNodes.length; ti++) {
            var tn = textNodes[ti];
            if (tn.fontName === figma.mixed) continue;
            var family = tn.fontName.family;
            var style = tn.fontName.style;
            var key = family.toLowerCase();

            if (!fontMap[key]) {
              // Detect icon font by name pattern or by content analysis
              var isIcon = iconFontPatterns.some(function(p) { return key.indexOf(p) >= 0; });
              // Also detect by content: single non-Latin character
              if (!isIcon && tn.characters.length <= 2 && tn.characters.length > 0) {
                var cpCheck = tn.characters.codePointAt(0);
                if (cpCheck && cpCheck > 0xFF) isIcon = true;
              }
              fontMap[key] = { family: family, styles: new Set(), isIconFont: isIcon, sampleChars: [] };
            }
            fontMap[key].styles.add(style);

            // Collect sample icon codepoints (up to 20)
            if (fontMap[key].isIconFont && fontMap[key].sampleChars.length < 20) {
              if (tn.characters.length <= 2 && tn.characters.length > 0) {
                var sampleCp = tn.characters.codePointAt(0);
                if (sampleCp && sampleCp > 0xFF) {
                  var hex = 'U+' + sampleCp.toString(16).toUpperCase().padStart(4, '0');
                  if (fontMap[key].sampleChars.indexOf(hex) === -1) {
                    fontMap[key].sampleChars.push(hex);
                  }
                }
              }
            }
          }

          // Known font mappings: Figma internal name → web CSS font-family, weight, and CDN.
          // Figma uses internal font names that often differ from the CSS font-family
          // registered by CDN stylesheets. This map bridges that gap.
          var fontWebMap: Record<string, { cssFontFamily: string; cssFontWeight: number; cdn: string }> = {
            'la-solid-900':           { cssFontFamily: 'Line Awesome Free', cssFontWeight: 900, cdn: 'https://cdnjs.cloudflare.com/ajax/libs/line-awesome/1.3.0/line-awesome/css/line-awesome.min.css' },
            'la-regular-400':         { cssFontFamily: 'Line Awesome Free', cssFontWeight: 400, cdn: 'https://cdnjs.cloudflare.com/ajax/libs/line-awesome/1.3.0/line-awesome/css/line-awesome.min.css' },
            'la-brands-400':          { cssFontFamily: 'Line Awesome Brands', cssFontWeight: 400, cdn: 'https://cdnjs.cloudflare.com/ajax/libs/line-awesome/1.3.0/line-awesome/css/line-awesome.min.css' },
            'font awesome 6 free':    { cssFontFamily: 'Font Awesome 6 Free', cssFontWeight: 900, cdn: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css' },
            'font awesome 5 free':    { cssFontFamily: 'Font Awesome 5 Free', cssFontWeight: 900, cdn: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css' },
            'font awesome 6 brands':  { cssFontFamily: 'Font Awesome 6 Brands', cssFontWeight: 400, cdn: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css' },
            'material icons':         { cssFontFamily: 'Material Icons', cssFontWeight: 400, cdn: 'https://fonts.googleapis.com/icon?family=Material+Icons' },
            'material symbols outlined': { cssFontFamily: 'Material Symbols Outlined', cssFontWeight: 400, cdn: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined' },
          };

          var styleToWeight = function(s: string): string {
            if (s === 'Thin') return '100';
            if (s === 'Extra Light' || s === 'ExtraLight') return '200';
            if (s === 'Light') return '300';
            if (s === 'Regular') return '400';
            if (s === 'Medium') return '500';
            if (s === 'Semi Bold' || s === 'SemiBold') return '600';
            if (s === 'Bold') return '700';
            if (s === 'Extra Bold' || s === 'ExtraBold') return '800';
            if (s === 'Black') return '900';
            return '400';
          };

          var fonts = Object.keys(fontMap).map(function(key) {
            var f = fontMap[key];
            var result: any = {
              family: f.family,
              styles: Array.from(f.styles),
              isIconFont: f.isIconFont,
            };
            if (f.isIconFont && f.sampleChars.length > 0) {
              result.sampleCodepoints = f.sampleChars;
            }
            // Look up web CSS mapping
            var webKey = Object.keys(fontWebMap).find(function(k) { return key.indexOf(k) >= 0; });
            if (webKey) {
              var webInfo = fontWebMap[webKey];
              result.cssFontFamily = webInfo.cssFontFamily;
              result.cssFontWeight = webInfo.cssFontWeight;
              result.cdn = webInfo.cdn;
            } else if (!f.isIconFont) {
              // Text font: CSS family matches Figma family, suggest Google Fonts
              result.cssFontFamily = f.family;
              result.googleFontsUrl = 'https://fonts.googleapis.com/css2?family=' +
                encodeURIComponent(f.family) + ':wght@' +
                Array.from(f.styles).map(styleToWeight).join(';') + '&display=swap';
            } else {
              // Unknown icon font: CSS family likely matches Figma family
              result.cssFontFamily = f.family;
            }
            return result;
          });

          responseData = {
            fileKey: figma.fileKey || 'local-file',
            fileName: figma.root.name,
            fonts: fonts,
          };
          break;
        }

        case 'search_nodes': {
          const query = (command.query || '').toLowerCase();
          const types = command.types as string[] | undefined;
          const results = figma.currentPage.findAll((n) => {
            if (types && types.length > 0 && !types.includes(n.type)) return false;
            return n.name.toLowerCase().includes(query);
          });
          responseData = results.slice(0, 50).map((n) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            bounds:
              'absoluteBoundingBox' in n && n.absoluteBoundingBox
                ? {
                    width: Math.round(n.absoluteBoundingBox.width),
                    height: Math.round(n.absoluteBoundingBox.height),
                  }
                : undefined,
          }));
          break;
        }

        case 'create_node': {
          const spec = command.spec;
          if (!spec) { error = 'No spec provided'; break; }

          async function createFromSpec(s: any, parent: BaseNode & ChildrenMixin): Promise<SceneNode> {
            if (s.type === 'text' && s.characters) {
              const text = figma.createText();
              // Load font before setting characters
              const family = s.fontFamily || 'Inter';
              const style = s.fontStyle || 'Regular';
              try {
                await figma.loadFontAsync({ family, style });
              } catch (_e) {
                // Fallback to Inter if the requested font isn't available
                try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); } catch (_e2) { /* ignore */ }
              }
              text.characters = s.characters;
              text.fontSize = s.fontSize || 14;
              try { text.fontName = { family, style }; } catch (_e) { /* keep default */ }
              if (s.textAlignHorizontal) text.textAlignHorizontal = s.textAlignHorizontal;
              if (s.lineHeight) text.lineHeight = { value: s.lineHeight, unit: 'PIXELS' };
              if (s.letterSpacing) text.letterSpacing = { value: s.letterSpacing, unit: 'PIXELS' };
              if (s.textDecoration) text.textDecoration = s.textDecoration;
              if (s.textCase) text.textCase = s.textCase;
              if (s.textColor) {
                text.fills = [{
                  type: 'SOLID',
                  color: { r: s.textColor.r, g: s.textColor.g, b: s.textColor.b },
                  opacity: s.textColor.a !== undefined ? s.textColor.a : 1,
                }];
              }
              text.name = s.name || 'Text';
              parent.appendChild(text);
              return text;
            }

            // Frame node
            const frame = figma.createFrame();
            frame.name = s.name || 'Frame';
            frame.resize(Math.max(1, s.width || 100), Math.max(1, s.height || 100));

            // Fills — use screenshot as image fill if available, otherwise use CSS-mapped fills
            if (s.imageData) {
              try {
                // Decode base64 screenshot to Uint8Array
                const raw = figma.base64Decode(s.imageData);
                const img = figma.createImage(raw);
                frame.fills = [{
                  type: 'IMAGE',
                  scaleMode: 'FILL',
                  imageHash: img.hash,
                }];
              } catch (_e) {
                // Fallback to CSS-mapped fills if image creation fails
                if (s.fills !== undefined) frame.fills = s.fills;
                else frame.fills = [];
              }
            } else if (s.fills !== undefined) {
              frame.fills = s.fills;
            } else {
              frame.fills = [];
            }

            // Strokes
            if (s.strokes && s.strokes.length > 0) {
              frame.strokes = s.strokes;
              frame.strokeWeight = s.strokeWeight || 1;
            }

            // Corner radius
            if (s.cornerRadius !== undefined) {
              frame.cornerRadius = s.cornerRadius;
            } else if (s.cornerRadii) {
              frame.topLeftRadius = s.cornerRadii.topLeft || 0;
              frame.topRightRadius = s.cornerRadii.topRight || 0;
              frame.bottomLeftRadius = s.cornerRadii.bottomLeft || 0;
              frame.bottomRightRadius = s.cornerRadii.bottomRight || 0;
            }

            // Effects
            if (s.effects && s.effects.length > 0) {
              frame.effects = s.effects;
            }

            // Opacity
            if (s.opacity !== undefined) frame.opacity = s.opacity;

            // Clip content
            if (s.clipsContent) frame.clipsContent = true;

            // Visibility
            if (s.visible === false) frame.visible = false;

            // Auto-layout
            if (s.layoutMode && s.layoutMode !== 'NONE') {
              frame.layoutMode = s.layoutMode;
              if (s.itemSpacing !== undefined) frame.itemSpacing = s.itemSpacing;
              if (s.paddingTop !== undefined) frame.paddingTop = s.paddingTop;
              if (s.paddingRight !== undefined) frame.paddingRight = s.paddingRight;
              if (s.paddingBottom !== undefined) frame.paddingBottom = s.paddingBottom;
              if (s.paddingLeft !== undefined) frame.paddingLeft = s.paddingLeft;
              if (s.primaryAxisAlignItems) frame.primaryAxisAlignItems = s.primaryAxisAlignItems;
              if (s.counterAxisAlignItems) frame.counterAxisAlignItems = s.counterAxisAlignItems;
              if (s.primaryAxisSizingMode) frame.primaryAxisSizingMode = s.primaryAxisSizingMode;
              if (s.counterAxisSizingMode) frame.counterAxisSizingMode = s.counterAxisSizingMode;
            }

            // Recursively create children
            if (s.children && s.children.length > 0) {
              for (const childSpec of s.children) {
                await createFromSpec(childSpec, frame);
              }
            }

            parent.appendChild(frame);
            return frame;
          }

          const created = await createFromSpec(spec, figma.currentPage);

          // Position at viewport center
          const center = figma.viewport.center;
          created.x = Math.round(center.x - (spec.width || 100) / 2);
          created.y = Math.round(center.y - (spec.height || 100) / 2);

          // Select and zoom to the created node
          figma.currentPage.selection = [created];
          figma.viewport.scrollAndZoomIntoView([created]);

          responseData = {
            nodeId: created.id,
            name: created.name,
            type: created.type,
            width: Math.round('width' in created ? created.width : 0),
            height: Math.round('height' in created ? created.height : 0),
          };
          break;
        }

        default:
          error = `Unknown command: ${command.action}`;
      }
    } catch (err: any) {
      error = err.message || 'Command execution failed';
    }

    figma.ui.postMessage({
      type: 'bridge-response',
      requestId,
      data: responseData,
      error,
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
  // Also send to bridge (UI will forward to WebSocket if connected)
  figma.ui.postMessage({
    type: 'bridge-selection',
    selection: selection.map((n) => ({ nodeId: n.id, nodeName: n.name, nodeType: n.type })),
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
  });
});

// Listen for document changes (node property updates) and forward to bridge.
// documentchange requires loadAllPagesAsync() first in incremental mode.
figma.loadAllPagesAsync().then(() => {
figma.on('documentchange', ({ documentChanges }) => {
  // Collect unique changed node IDs
  const changedNodeIds = new Set<string>();
  for (const change of documentChanges) {
    if (change.type === 'PROPERTY_CHANGE' && change.node && 'id' in change.node) {
      changedNodeIds.add(change.node.id);
      // Also include parent to catch layout changes
      const node = change.node as SceneNode;
      const parent = node.parent;
      if (parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
        changedNodeIds.add(parent.id);
      }
    }
  }
  if (changedNodeIds.size > 0) {
    figma.ui.postMessage({
      type: 'bridge-document-change',
      changedNodeIds: Array.from(changedNodeIds),
    });
  }
});
});

// Send initial selection info
const initialSelection = figma.currentPage.selection;
figma.ui.postMessage({
  type: 'selection-info',
  count: initialSelection.length,
  items: initialSelection.map((n) => ({ id: n.id, name: n.name, type: n.type })),
});
