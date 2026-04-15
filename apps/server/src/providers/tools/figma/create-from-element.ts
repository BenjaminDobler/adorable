/**
 * figma_create_from_element tool
 *
 * Extracts a DOM element from the running preview via CDP, maps its CSS
 * to Figma properties deterministically, and sends the spec to the Figma
 * plugin to create the design node.
 */

import { Tool } from '../types';
import { getCdpAgentUrl, isDesktopMode } from '../utils';
import { cssToFigma, NodeSpec } from './css-to-figma';
import { figmaBridge } from '../../../services/figma-bridge.service';

/** CDP expression that extracts element styles + children recursively */
function buildExtractionExpression(selector: string, maxDepth: number): string {
  // Escape selector for use inside JS string
  const sel = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `(function(){
    var PROPS = ['display','flexDirection','justifyContent','alignItems','gap','rowGap','columnGap',
      'width','height','padding','paddingTop','paddingRight','paddingBottom','paddingLeft',
      'margin','marginTop','marginRight','marginBottom','marginLeft',
      'backgroundColor','color','opacity','overflow','overflowX','overflowY','visibility',
      'borderWidth','borderTopWidth','borderColor','borderTopColor','borderStyle',
      'borderRadius','borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius',
      'boxShadow','fontSize','fontFamily','fontWeight','fontStyle','lineHeight','letterSpacing',
      'textAlign','textDecoration','textTransform'];

    function getStyles(el) {
      var cs = getComputedStyle(el);
      var result = {};
      for (var i = 0; i < PROPS.length; i++) {
        var val = cs.getPropertyValue(PROPS[i].replace(/([A-Z])/g, '-$1').toLowerCase());
        if (val && val !== 'none' && val !== 'normal' && val !== '0px' && val !== 'rgba(0, 0, 0, 0)') {
          result[PROPS[i]] = val;
        }
      }
      // Also get camelCase versions for properties that differ
      result.display = cs.display;
      result.flexDirection = cs.flexDirection;
      result.justifyContent = cs.justifyContent;
      result.alignItems = cs.alignItems;
      result.overflow = cs.overflow;
      result.visibility = cs.visibility;
      result.textAlign = cs.textAlign;
      result.textTransform = cs.textTransform;
      return result;
    }

    function getCssVars(el) {
      var vars = {};
      var cs = getComputedStyle(el);
      // Check for common SAP theme variables used by this element
      var sapVars = ['--sapBrandColor','--sapBackgroundColor','--sapTextColor','--sapButton_Background',
        '--sapButton_BorderColor','--sapButton_TextColor','--sapContent_LabelColor',
        '--sapList_Background','--sapGroup_ContentBackground'];
      for (var i = 0; i < sapVars.length; i++) {
        var val = cs.getPropertyValue(sapVars[i]).trim();
        if (val) vars[sapVars[i]] = val;
      }
      return Object.keys(vars).length > 0 ? vars : undefined;
    }

    function extractNode(el, depth) {
      var rect = el.getBoundingClientRect();
      var styles = getStyles(el);
      var componentName = null;
      try {
        if (window.ng) {
          var comp = window.ng.getComponent(el);
          if (comp) componentName = comp.constructor.name;
        }
      } catch(e) {}

      // Determine if this is a text node (leaf with only text content)
      var isText = el.children.length === 0 && el.textContent && el.textContent.trim().length > 0;

      var node = {
        tag: el.tagName.toLowerCase(),
        type: isText ? 'text' : 'frame',
        text: isText ? el.textContent.trim() : undefined,
        name: componentName || (el.tagName.includes('-') ? el.tagName.toLowerCase() : undefined) || el.className?.split(' ')[0] || undefined,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        styles: styles,
        children: [],
        cssVariables: getCssVars(el),
        angularComponent: componentName,
        ongId: el.getAttribute('_ong') || undefined
      };

      // Recurse into children (skip script, style, svg elements)
      if (depth > 0 && !isText) {
        var children = el.children;
        for (var i = 0; i < children.length; i++) {
          var child = children[i];
          var tag = child.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'noscript') continue;
          // Skip invisible elements
          var cs = getComputedStyle(child);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          var childRect = child.getBoundingClientRect();
          if (childRect.width === 0 && childRect.height === 0) continue;
          node.children.push(extractNode(child, depth - 1));
        }
      }
      return node;
    }

    var el = document.querySelector('${sel}');
    if (!el) {
      // Try ONG annotation ID
      el = document.querySelector('[_ong="${sel}"]');
    }
    if (!el) return { error: 'Element not found: ${sel}' };

    return extractNode(el, ${maxDepth});
  })()`;
}

export const figmaCreateFromElement: Tool = {
  definition: {
    name: 'figma_create_from_element',
    description: 'Extract a DOM element from the preview and recreate it as a Figma design node. '
      + 'Deterministically maps CSS properties to Figma equivalents (fills, strokes, auto-layout, text, shadows, etc.). '
      + 'The created design appears at the current viewport position in Figma.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or ONG annotation ID for the element to recreate (e.g., "app-product-catalog", ".card", "ui5-shellbar").'
        },
        depth: {
          type: 'number',
          description: 'Max depth of child elements to include. Default 5. Use 0 for just the element itself, -1 for full depth.'
        },
      },
      required: ['selector']
    },
  },

  async execute(args, ctx) {
    const userId = ctx.userId || '';

    // Check prerequisites
    if (!isDesktopMode()) {
      return { content: 'figma_create_from_element is only available in desktop mode with the preview running.', isError: true };
    }
    if (!figmaBridge.isConnected(userId)) {
      return { content: 'Figma is not connected. The user needs to open the Adorable plugin in Figma Desktop and connect via the Live Bridge.', isError: true };
    }

    const selector = args.selector;
    const depth = args.depth ?? 5;

    // Step 1: Extract DOM element via CDP
    const agentUrl = getCdpAgentUrl();
    let nodeSpec: NodeSpec;

    try {
      const expression = buildExtractionExpression(selector, depth);
      const resp = await fetch(`${agentUrl}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `CDP extraction failed: ${data.error}`, isError: true };
      }

      const result = data.result?.value ?? data.result ?? data;
      if (result.error) {
        return { content: `Element extraction failed: ${result.error}`, isError: true };
      }

      nodeSpec = result as NodeSpec;
    } catch (err: any) {
      return { content: `CDP request failed: ${err.message}`, isError: true };
    }

    // Step 2: Map CSS → Figma properties (deterministic)
    const figmaSpec = cssToFigma(nodeSpec);

    // Step 3: Send to Figma bridge
    try {
      const result = await figmaBridge.sendCommand(userId, {
        action: 'create_node',
        spec: figmaSpec,
      });

      const childCount = countNodes(figmaSpec) - 1;
      return {
        content: `Created "${figmaSpec.name}" in Figma (${figmaSpec.width}×${figmaSpec.height}${childCount > 0 ? `, ${childCount} child nodes` : ''}). Node ID: ${result.nodeId || 'created'}`,
        isError: false,
      };
    } catch (err: any) {
      return { content: `Figma creation failed: ${err.message}`, isError: true };
    }
  }
};

function countNodes(spec: { children: any[] }): number {
  return 1 + spec.children.reduce((sum: number, child: any) => sum + countNodes(child), 0);
}
