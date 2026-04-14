import { Tool } from '../types';
import { getCdpAgentUrl, isDesktopMode } from '../utils';

export const inspectStyles: Tool = {
  definition: {
    name: 'inspect_styles',
    description: 'Get computed CSS styles for an element in the preview. Returns key layout and visual properties (display, position, width, height, margin, padding, color, background, opacity, visibility, overflow, z-index, flex, grid). Use to debug why elements are invisible, misaligned, or incorrectly sized.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to inspect (e.g., ".header", "#main", "app-navbar").'
        }
      },
      required: ['selector']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'inspect_styles is only available in desktop mode.', isError: true };
    }

    try {
      const sel = String(args.selector || '').replace(/'/g, "\\'");
      const expression = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Element not found: ${sel}'};var cs=getComputedStyle(el);var props=['display','position','width','height','minWidth','minHeight','maxWidth','maxHeight','margin','marginTop','marginRight','marginBottom','marginLeft','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','color','backgroundColor','opacity','visibility','overflow','overflowX','overflowY','zIndex','flexDirection','flexWrap','justifyContent','alignItems','gap','gridTemplateColumns','gridTemplateRows','fontSize','fontWeight','lineHeight','textAlign','border','borderRadius','boxShadow','transform','transition'];var result={};for(var i=0;i<props.length;i++){var v=cs.getPropertyValue(props[i].replace(/([A-Z])/g,'-$1').toLowerCase());if(v&&v!=='none'&&v!=='normal'&&v!=='auto'&&v!=='0px'&&v!=='rgba(0, 0, 0, 0)'&&v!=='transparent')result[props[i]]=v;}return{selector:'${sel}',tag:el.tagName.toLowerCase(),styles:result};})()`;

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `inspect_styles failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data.result?.value ?? data.result ?? data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `inspect_styles failed: ${err.message}`, isError: true };
    }
  }
};

export const inspectDom: Tool = {
  definition: {
    name: 'inspect_dom',
    description: 'Get the HTML content of a specific element in the preview. Returns the outer HTML of the matched element, useful for understanding DOM structure without writing JS.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element (e.g., "main", ".content", "app-root").'
        },
        depth: {
          type: 'number',
          description: 'Maximum depth of child elements to include. Default 3. Use 0 for just the element itself, -1 for full depth.'
        }
      },
      required: ['selector']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'inspect_dom is only available in desktop mode.', isError: true };
    }

    try {
      const sel = String(args.selector || '').replace(/'/g, "\\'");
      const depth = args.depth ?? 3;
      const expression = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Element not found: ${sel}'};function trim(node,d){if(d===0)return '';var clone=node.cloneNode(true);if(d>0){var children=Array.from(clone.children);for(var i=0;i<children.length;i++){var inner=trim(node.children[i],d-1);if(!inner){clone.removeChild(children[i]);}else{children[i].innerHTML=inner;}}}return clone.outerHTML;}return{selector:'${sel}',html:${depth < 0 ? 'el.outerHTML' : 'trim(el,' + depth + ')'}};})()`;

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `inspect_dom failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data.result?.value ?? data.result ?? data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `inspect_dom failed: ${err.message}`, isError: true };
    }
  }
};

export const measureElement: Tool = {
  definition: {
    name: 'measure_element',
    description: 'Get the position, dimensions, and visibility of an element in the preview. Returns bounding box (x, y, width, height), whether it is visible, and scroll position. Use for debugging layout issues.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to measure.'
        }
      },
      required: ['selector']
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'measure_element is only available in desktop mode.', isError: true };
    }

    try {
      const sel = String(args.selector || '').replace(/'/g, "\\'");
      const expression = `(function(){var el=document.querySelector('${sel}');if(!el)return{error:'Element not found: ${sel}'};var rect=el.getBoundingClientRect();var cs=getComputedStyle(el);return{selector:'${sel}',tag:el.tagName.toLowerCase(),x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height),visible:rect.width>0&&rect.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&cs.opacity!=='0',display:cs.display,visibility:cs.visibility,opacity:cs.opacity,scrollTop:el.scrollTop,scrollLeft:el.scrollLeft,scrollHeight:el.scrollHeight,scrollWidth:el.scrollWidth,viewportWidth:window.innerWidth,viewportHeight:window.innerHeight,inViewport:rect.top<window.innerHeight&&rect.bottom>0&&rect.left<window.innerWidth&&rect.right>0};})()`;

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `measure_element failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data.result?.value ?? data.result ?? data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `measure_element failed: ${err.message}`, isError: true };
    }
  }
};

export const injectCss: Tool = {
  definition: {
    name: 'inject_css',
    description: 'Inject temporary CSS into the preview for rapid visual prototyping. The CSS is not persisted to files — it only affects the current preview session. Use to test style changes before committing them. Use action "add" to inject, "clear" to remove all injected styles.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'clear'],
          description: 'Action: "add" to inject CSS, "clear" to remove all injected styles.'
        },
        css: {
          type: 'string',
          description: 'The CSS rules to inject (only for "add" action).'
        }
      },
      required: ['action']
    },
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'inject_css is only available in desktop mode.', isError: true };
    }

    try {
      let expression = '';

      if (args.action === 'clear') {
        expression = `(function(){var el=document.getElementById('__adorable_injected_css');if(el)el.remove();return{status:'cleared'};})()`;
      } else {
        const css = String(args.css || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
        expression = `(function(){var el=document.getElementById('__adorable_injected_css');if(!el){el=document.createElement('style');el.id='__adorable_injected_css';document.head.appendChild(el);}el.textContent+='\\n${css}';return{status:'injected',totalRules:el.sheet?el.sheet.cssRules.length:0};})()`;
      }

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `inject_css failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data.result?.value ?? data.result ?? data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `inject_css failed: ${err.message}`, isError: true };
    }
  }
};

export const getBundleStats: Tool = {
  definition: {
    name: 'get_bundle_stats',
    description: 'Get the bundle size breakdown from the last build. Returns initial and lazy chunk sizes. Use to identify large bundles, check if lazy loading is working, or verify tree-shaking.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    },
    isReadOnly: true,
  },

  async execute(args, ctx) {
    if (!isDesktopMode()) {
      return { content: 'get_bundle_stats is only available in desktop mode.', isError: true };
    }

    try {
      const expression = `(function(){var entries=performance.getEntriesByType('resource').filter(function(e){return e.name.endsWith('.js');});var chunks=entries.map(function(e){var name=e.name.split('/').pop();return{name:name,size:e.transferSize||0,duration:Math.round(e.duration)};});chunks.sort(function(a,b){return b.size-a.size;});var total=chunks.reduce(function(s,c){return s+c.size;},0);return{totalSize:total,totalSizeKB:Math.round(total/1024),chunks:chunks};})()`;

      const resp = await fetch(`${getCdpAgentUrl()}/api/native/cdp/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return { content: `get_bundle_stats failed: ${data.error}`, isError: true };
      }
      return { content: JSON.stringify(data.result?.value ?? data.result ?? data, null, 2), isError: false };
    } catch (err: any) {
      return { content: `get_bundle_stats failed: ${err.message}`, isError: true };
    }
  }
};
