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

/** CDP expression that extracts element styles + children recursively.
 *  Handles Shadow DOM (UI5 web components render inside shadow roots). */
function buildExtractionExpression(selector: string, maxDepth: number): string {
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
        var kebab = PROPS[i].replace(/([A-Z])/g, '-$1').toLowerCase();
        var val = cs.getPropertyValue(kebab);
        if (val && val !== 'none' && val !== 'normal' && val !== '0px' && val !== 'rgba(0, 0, 0, 0)' && val !== 'transparent') {
          result[PROPS[i]] = val;
        }
      }
      // Ensure camelCase versions
      result.display = cs.display;
      result.flexDirection = cs.flexDirection;
      result.justifyContent = cs.justifyContent;
      result.alignItems = cs.alignItems;
      result.overflow = cs.overflow;
      result.visibility = cs.visibility;
      result.textAlign = cs.textAlign;
      result.textTransform = cs.textTransform;
      result.backgroundColor = cs.backgroundColor;
      result.color = cs.color;
      result.fontFamily = cs.fontFamily;
      result.fontSize = cs.fontSize;
      result.fontWeight = cs.fontWeight;
      return result;
    }

    function getVisualChildren(el) {
      // If the element has a shadow root, use shadow children as the visual
      // representation. This is critical for web components (UI5, etc.) whose
      // light DOM children are just slots — the actual rendered content is in
      // the shadow root.
      if (el.shadowRoot) {
        // Get shadow root children that are actual elements (skip style/slot nodes that are empty)
        var shadowChildren = Array.from(el.shadowRoot.children).filter(function(c) {
          var tag = c.tagName ? c.tagName.toLowerCase() : '';
          if (tag === 'style' || tag === 'link') return false;
          // Keep slot elements only if they have assigned nodes
          if (tag === 'slot') return false;
          var rect = c.getBoundingClientRect();
          return rect.width > 0 || rect.height > 0;
        });
        if (shadowChildren.length > 0) return shadowChildren;
      }
      // Fall back to light DOM children
      return Array.from(el.children);
    }

    function getDirectText(el) {
      // Get text directly owned by this element (not from children)
      var text = '';
      for (var i = 0; i < el.childNodes.length; i++) {
        if (el.childNodes[i].nodeType === 3) { // TEXT_NODE
          text += el.childNodes[i].textContent;
        }
      }
      // Also check shadow root for direct text
      if (!text.trim() && el.shadowRoot) {
        for (var i = 0; i < el.shadowRoot.childNodes.length; i++) {
          if (el.shadowRoot.childNodes[i].nodeType === 3) {
            text += el.shadowRoot.childNodes[i].textContent;
          }
        }
        // Check slotted content
        var slots = el.shadowRoot.querySelectorAll('slot');
        for (var s = 0; s < slots.length; s++) {
          var assigned = slots[s].assignedNodes();
          for (var a = 0; a < assigned.length; a++) {
            if (assigned[a].nodeType === 3) text += assigned[a].textContent;
          }
        }
      }
      return text.trim();
    }

    function extractNode(el, depth) {
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return null;

      var styles = getStyles(el);
      var componentName = null;
      try {
        if (window.ng) {
          var comp = window.ng.getComponent(el);
          if (comp) componentName = comp.constructor.name;
        }
      } catch(e) {}

      var children = getVisualChildren(el);
      var directText = getDirectText(el);
      var isLeaf = children.length === 0;
      var isText = isLeaf && directText.length > 0;

      // For shadow DOM hosts with no visible shadow children but with visible
      // slotted content, treat the element itself as the visual container
      // and extract styles from the first meaningful shadow child instead.
      if (el.shadowRoot && !isText) {
        var shadowEl = el.shadowRoot.querySelector('[class]');
        if (shadowEl) {
          var shadowStyles = getStyles(shadowEl);
          // Merge shadow styles into host styles (shadow wins for visual props)
          if (shadowStyles.backgroundColor && shadowStyles.backgroundColor !== 'rgba(0, 0, 0, 0)')
            styles.backgroundColor = shadowStyles.backgroundColor;
          if (shadowStyles.borderRadius) styles.borderRadius = shadowStyles.borderRadius;
          if (shadowStyles.borderTopLeftRadius) styles.borderTopLeftRadius = shadowStyles.borderTopLeftRadius;
          if (shadowStyles.borderTopRightRadius) styles.borderTopRightRadius = shadowStyles.borderTopRightRadius;
          if (shadowStyles.borderBottomLeftRadius) styles.borderBottomLeftRadius = shadowStyles.borderBottomLeftRadius;
          if (shadowStyles.borderBottomRightRadius) styles.borderBottomRightRadius = shadowStyles.borderBottomRightRadius;
          if (shadowStyles.borderColor) styles.borderColor = shadowStyles.borderColor;
          if (shadowStyles.borderWidth && shadowStyles.borderWidth !== '0px') styles.borderWidth = shadowStyles.borderWidth;
          if (shadowStyles.boxShadow && shadowStyles.boxShadow !== 'none') styles.boxShadow = shadowStyles.boxShadow;
          if (shadowStyles.padding && shadowStyles.padding !== '0px') {
            styles.paddingTop = shadowStyles.paddingTop;
            styles.paddingRight = shadowStyles.paddingRight;
            styles.paddingBottom = shadowStyles.paddingBottom;
            styles.paddingLeft = shadowStyles.paddingLeft;
          }
          if (shadowStyles.display === 'flex' || shadowStyles.display === 'inline-flex') {
            styles.display = shadowStyles.display;
            styles.flexDirection = shadowStyles.flexDirection;
            styles.justifyContent = shadowStyles.justifyContent;
            styles.alignItems = shadowStyles.alignItems;
            styles.gap = shadowStyles.gap;
          }
          if (shadowStyles.color) styles.color = shadowStyles.color;
          if (shadowStyles.fontFamily) styles.fontFamily = shadowStyles.fontFamily;
          if (shadowStyles.fontSize) styles.fontSize = shadowStyles.fontSize;
          if (shadowStyles.fontWeight) styles.fontWeight = shadowStyles.fontWeight;
        }
      }

      var tag = el.tagName ? el.tagName.toLowerCase() : 'span';
      var node = {
        tag: tag,
        type: isText ? 'text' : 'frame',
        text: isText ? directText.substring(0, 500) : undefined,
        name: componentName || (tag.includes('-') ? tag : undefined) || (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : undefined) || undefined,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        styles: styles,
        children: [],
        angularComponent: componentName,
        ongId: el.getAttribute ? el.getAttribute('_ong') || undefined : undefined
      };

      // Recurse into visual children
      if (depth > 0 && !isText) {
        for (var i = 0; i < children.length; i++) {
          var child = children[i];
          if (!child.tagName) continue;
          var ctag = child.tagName.toLowerCase();
          if (ctag === 'script' || ctag === 'style' || ctag === 'link' || ctag === 'noscript') continue;
          var cs = getComputedStyle(child);
          if (cs.display === 'none') continue;
          var childNode = extractNode(child, depth - 1);
          if (childNode) node.children.push(childNode);
        }
      }
      return node;
    }

    var el = document.querySelector('${sel}');
    if (!el) el = document.querySelector('[_ong="${sel}"]');
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

    // Step 2: Capture a screenshot of the element for image-fill fallback.
    // This ensures the Figma node looks correct even when CSS extraction
    // misses shadow DOM styles or complex visual properties.
    let screenshotBase64: string | undefined;
    try {
      const sel2 = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const clipExpr = `(function(){
        var el = document.querySelector('${sel2}') || document.querySelector('[_ong="${sel2}"]');
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()`;
      const clipResp = await fetch(`${agentUrl}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: clipExpr }),
      });
      const clipData = await clipResp.json();
      const clip = clipData.result?.value ?? clipData.result;

      if (clip && clip.width > 0 && clip.height > 0) {
        // Use CDP Page.captureScreenshot with clip region
        const ssResp = await fetch(`${agentUrl}/api/native/cdp/screenshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clip, quality: 95 }),
        });
        const ssData = await ssResp.json();
        if (ssData.image) {
          screenshotBase64 = ssData.image;
        }
      }
    } catch (_e) {
      // Screenshot is optional — continue without it
    }

    // Step 3: Map CSS → Figma properties (deterministic)
    const figmaSpec = cssToFigma(nodeSpec);

    // Attach screenshot as image data on the root node
    if (screenshotBase64) {
      (figmaSpec as any).imageData = screenshotBase64;
    }

    // Step 4: Send to Figma bridge
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
