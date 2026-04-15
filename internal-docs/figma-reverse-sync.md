# Figma Reverse Sync — Code to Design

**Status:** Plan
**Companion to:** Existing Figma Live Bridge (design → code)

## Overview

Add the ability to select an element in Adorable's preview and recreate it as a Figma design node. This closes the design-development loop: Figma → code (existing) and code → Figma (this feature).

The user flow:
1. Select an element in the preview using the visual editor
2. Ask the AI: "recreate this in Figma"
3. The system inspects the element, translates CSS to Figma properties, and creates the design in Figma

## Why this matters

- **Design documentation.** Developer builds a page, designer needs it in Figma for documentation, specs, or handoff. Currently this is manual recreation.
- **Design system alignment.** After building with UI5 components, the Figma file should reflect what was actually built — not what was originally designed.
- **Prototyping round-trip.** Design a rough layout in Figma → implement in Adorable → push the refined implementation back to Figma with exact spacing and colors.
- **Unique positioning.** No AI coding tool currently does live reverse-sync from a running app preview into Figma.

## Architecture — Two-pass hybrid

The system uses a two-pass approach: a fast deterministic extraction pass followed by an optional AI refinement pass.

```
User: "recreate this card in Figma"
          │
          ▼
    AI (orchestration)
    - understands what the user wants
    - calls figma_create_from_element tool
          │
          ▼
    Pass 1: Deterministic extraction
    - DOM traversal via CDP (recursive)
    - computed style extraction for each node
    - CSS → Figma property mapping (mechanical, no LLM)
    - Output: raw Figma spec (JSON tree of nodes with properties)
    ~100ms, zero tokens
          │
          ▼
    Pass 2: AI refinement (optional)
    - receives the raw spec + DOM context
    - recognizes known components → swaps for library components
    - rounds values to design grid
    - simplifies repeated content
    - assigns semantic styles where applicable
    - Output: refined Figma spec
    ~2-5s, ~2-4K tokens
          │
          ▼
    Figma Plugin (code.ts)
    - receives final spec via bridge
    - creates nodes using Figma Plugin API
    - deterministic, ~50-200ms
```

### Why two passes?

**Pass 1 alone produces a usable result.** If the AI is unavailable, too expensive, or unnecessary (simple element), the deterministic pass creates a pixel-accurate Figma recreation. Every CSS property maps to a Figma property mechanically.

**Pass 2 adds design intelligence.** The AI improves the result in ways a pure mapper can't — recognizing components, cleaning up values, simplifying content. But it works on a structured spec (not raw CSS), so its job is small and reliable.

This is the same pattern as the kit system: deterministic data extraction → AI consumes structured input.

## Pass 1 — Deterministic CSS-to-Figma mapping

### DOM traversal

A CDP `evaluate` call walks the DOM subtree of the selected element recursively:

```typescript
function extractNode(el: HTMLElement, depth: number): NodeSpec {
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  const spec: NodeSpec = {
    tag: el.tagName.toLowerCase(),
    type: el.children.length > 0 ? 'frame' : (el.textContent ? 'text' : 'frame'),
    text: el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
      ? el.textContent : undefined,
    bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    styles: extractStyles(cs),
    children: depth > 0
      ? Array.from(el.children).map(c => extractNode(c as HTMLElement, depth - 1))
      : [],
  };
  return spec;
}
```

### CSS → Figma property mapping

| CSS Property | Figma API Property | Conversion |
|---|---|---|
| `display: flex` | `frame.layoutMode` | `'HORIZONTAL'` or `'VERTICAL'` based on `flex-direction` |
| `flex-direction: column` | `frame.layoutMode = 'VERTICAL'` | Direct |
| `flex-direction: row` | `frame.layoutMode = 'HORIZONTAL'` | Direct |
| `justify-content` | `frame.primaryAxisAlignItems` | `center` → `'CENTER'`, `space-between` → `'SPACE_BETWEEN'`, etc. |
| `align-items` | `frame.counterAxisAlignItems` | `center` → `'CENTER'`, `stretch` → `'STRETCH'`, etc. |
| `gap` | `frame.itemSpacing` | Parse px value |
| `padding-*` | `frame.paddingTop/Right/Bottom/Left` | Parse px values |
| `width` / `height` | `frame.resize(w, h)` | Parse px values |
| `background-color` | `frame.fills` | `rgb(r,g,b)` → `[{ type: 'SOLID', color: { r: r/255, g: g/255, b: b/255 } }]` |
| `background: linear-gradient(...)` | `frame.fills` | `[{ type: 'GRADIENT_LINEAR', gradientStops: [...] }]` |
| `background-image: url(...)` | `frame.fills` | `[{ type: 'IMAGE', ... }]` (requires image export) |
| `border` | `frame.strokes` + `frame.strokeWeight` | Parse color + width |
| `border-radius` | `frame.cornerRadius` | Parse px value. Per-corner: `topLeftRadius`, etc. |
| `box-shadow` | `frame.effects` | `[{ type: 'DROP_SHADOW', color, offset, radius }]` |
| `opacity` | `node.opacity` | Direct (0-1) |
| `overflow: hidden` | `frame.clipsContent = true` | Direct |
| `color` | `text.fills` | RGB conversion |
| `font-family` | `text.fontName` | `{ family, style }` — requires `figma.loadFontAsync()` |
| `font-size` | `text.fontSize` | Parse px value |
| `font-weight` | `text.fontName.style` | `400` → `'Regular'`, `600` → `'Semi Bold'`, `700` → `'Bold'` |
| `line-height` | `text.lineHeight` | `{ value, unit: 'PIXELS' }` |
| `text-align` | `text.textAlignHorizontal` | `left` → `'LEFT'`, `center` → `'CENTER'`, etc. |
| `letter-spacing` | `text.letterSpacing` | `{ value, unit: 'PIXELS' }` |
| `text-decoration: underline` | `text.textDecoration = 'UNDERLINE'` | Direct |
| `text-transform: uppercase` | `text.textCase = 'UPPER'` | Direct |
| `visibility: hidden` | `node.visible = false` | Direct |
| `transform: rotate(Xdeg)` | `node.rotation = X` | Parse degrees |

### NodeSpec format

The intermediate format between the extractor and the Figma creator:

```typescript
interface NodeSpec {
  tag: string;                          // HTML tag for context
  type: 'frame' | 'text' | 'image';    // Figma node type
  name?: string;                        // Node name (from component name, class, or tag)
  text?: string;                        // Text content (for text nodes)
  bounds: { x: number; y: number; width: number; height: number };

  // Visual properties
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  effects?: FigmaEffect[];
  cornerRadius?: number | { topLeft: number; topRight: number; bottomLeft: number; bottomRight: number };
  opacity?: number;
  clipsContent?: boolean;
  visible?: boolean;
  rotation?: number;

  // Layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  layoutSizing?: { horizontal: 'FIXED' | 'HUG' | 'FILL'; vertical: 'FIXED' | 'HUG' | 'FILL' };

  // Text properties
  font?: { family: string; style: string; size: number; weight: number };
  textAlign?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: string;
  textCase?: string;
  textColor?: { r: number; g: number; b: number; a?: number };

  // Image (for elements with background images or <img> tags)
  imageData?: string;                   // base64 PNG export of the element

  // Metadata
  cssVariables?: Record<string, string>; // --sap* variables used by this element
  angularComponent?: string;            // Angular component name if detected
  ongId?: string;                       // ONG annotation ID

  children: NodeSpec[];
}
```

## Pass 2 — AI refinement

The AI receives the raw `NodeSpec` tree and can modify it before it's sent to Figma. The AI is NOT asked to do the CSS → Figma mapping — that's already done. Instead, it makes design-quality improvements:

### What the AI refines

**1. Component recognition**

The raw spec creates 40 nested frames for a `<ui5-shellbar>`. The AI recognizes it's a shellbar and can:
- Replace the subtree with a reference to a UI5 Figma kit component (if available in the Figma file)
- Or simplify the subtree to just the meaningful structure (logo, title, actions)
- Name the Figma frame "ShellBar" instead of "div > div > div"

**2. Grid snapping**

Raw CSS: `width: 347.5px; margin-left: 12.25px; gap: 7px`
Refined: `width: 348px; margin-left: 12px; gap: 8px` (snapped to 4px grid)

**3. Content simplification**

A list with 12 items → AI decides to keep 3 representative items and add a "..." indicator. A table with 50 rows → AI keeps the header + 3 rows.

**4. Semantic style assignment**

Raw: `fontSize: 14, color: { r: 0.075, g: 0.118, b: 0.161 }`
Refined: assigns Figma text style "Body/Regular" if the Figma file has one that matches.

**5. Variable binding**

If the element uses `var(--sapBrandColor)` (captured in `cssVariables`), and the Figma file has a local variable called `sapBrandColor`, bind the fill to the variable instead of using a hardcoded color.

**6. Layout intent**

Raw: two children with `width: 620px` and `width: 380px` in a `1000px` container.
Refined: recognizes this as a 60/40 split → sets `layoutSizing` to `FILL` with `layoutGrow` ratios instead of fixed widths.

**7. Pruning non-visual elements**

Skip invisible overflow containers, scroll wrappers, Angular host elements that don't contribute visually. The AI can identify these from the tag names and styles.

### AI prompt structure

```
You are refining a Figma design spec extracted from a running Angular application.
The CSS-to-Figma mapping is already done — you're improving the design quality.

Rules:
- Round all dimensions to the nearest 4px grid
- If you recognize a known UI5 component (tag starts with ui5-), name the frame
  after the component (e.g., "ShellBar", "List", "Card")
- Simplify repeated children: keep 2-3 representative items, remove the rest
- If cssVariables contains --sap* tokens, note them for variable binding
- Remove frames that are purely structural (no visual properties, just wrappers)
- Preserve the visual hierarchy — don't flatten important nesting

Input: [NodeSpec JSON]
Output: [Refined NodeSpec JSON with your changes]
```

### When to skip Pass 2

- Simple elements (single frame, no children) — deterministic is sufficient
- User says "exact copy" — skip refinement, create pixel-perfect
- Cost/speed concerns — the deterministic pass alone is free and fast

The tool should accept an optional `refine: boolean` parameter (default: true for complex subtrees, false for simple elements).

## Figma Plugin — create_node command

### New bridge command

Add to `apps/figma-plugin/src/code.ts`:

```typescript
case 'create_node': {
  const { spec, parentId, position } = command;

  // Determine where to create
  const parent = parentId
    ? figma.getNodeById(parentId) as FrameNode
    : figma.currentPage;

  // Recursive creation
  const created = await createFromSpec(spec, parent);

  // Position on canvas
  if (position) {
    created.x = position.x;
    created.y = position.y;
  } else {
    // Place near the current viewport center
    const viewport = figma.viewport.center;
    created.x = viewport.x;
    created.y = viewport.y;
  }

  // Select and zoom to the created node
  figma.currentPage.selection = [created];
  figma.viewport.scrollAndZoomIntoView([created]);

  return { nodeId: created.id, name: created.name, childCount: countChildren(created) };
}
```

### createFromSpec implementation

```typescript
async function createFromSpec(spec: NodeSpec, parent: BaseNode & ChildrenMixin): Promise<SceneNode> {
  if (spec.type === 'text') {
    return await createTextNode(spec, parent);
  }

  const frame = figma.createFrame();
  frame.name = spec.name || spec.angularComponent || spec.tag || 'Frame';

  // Dimensions
  frame.resize(
    Math.max(1, Math.round(spec.bounds.width)),
    Math.max(1, Math.round(spec.bounds.height))
  );

  // Fills
  if (spec.fills) frame.fills = spec.fills;
  else frame.fills = []; // transparent by default

  // Strokes
  if (spec.strokes) {
    frame.strokes = spec.strokes;
    frame.strokeWeight = spec.strokes[0]?.weight || 1;
  }

  // Corner radius
  if (spec.cornerRadius) {
    if (typeof spec.cornerRadius === 'number') {
      frame.cornerRadius = spec.cornerRadius;
    } else {
      frame.topLeftRadius = spec.cornerRadius.topLeft;
      frame.topRightRadius = spec.cornerRadius.topRight;
      frame.bottomLeftRadius = spec.cornerRadius.bottomLeft;
      frame.bottomRightRadius = spec.cornerRadius.bottomRight;
    }
  }

  // Effects (shadows)
  if (spec.effects) frame.effects = spec.effects;

  // Opacity
  if (spec.opacity !== undefined) frame.opacity = spec.opacity;

  // Clip content
  if (spec.clipsContent) frame.clipsContent = true;

  // Auto-layout
  if (spec.layoutMode && spec.layoutMode !== 'NONE') {
    frame.layoutMode = spec.layoutMode;
    if (spec.itemSpacing) frame.itemSpacing = spec.itemSpacing;
    if (spec.padding) {
      frame.paddingTop = spec.padding.top;
      frame.paddingRight = spec.padding.right;
      frame.paddingBottom = spec.padding.bottom;
      frame.paddingLeft = spec.padding.left;
    }
    if (spec.primaryAxisAlignItems) {
      frame.primaryAxisAlignItems = spec.primaryAxisAlignItems as any;
    }
    if (spec.counterAxisAlignItems) {
      frame.counterAxisAlignItems = spec.counterAxisAlignItems as any;
    }
  }

  // Variable bindings (if Figma file has matching variables)
  if (spec.cssVariables) {
    await bindVariables(frame, spec.cssVariables);
  }

  // Recursively create children
  for (const childSpec of spec.children) {
    const child = await createFromSpec(childSpec, frame);
    frame.appendChild(child);
  }

  parent.appendChild(frame);
  return frame;
}
```

### Variable binding

```typescript
async function bindVariables(node: SceneNode, cssVars: Record<string, string>) {
  const localVars = figma.variables.getLocalVariables();

  for (const [cssName, value] of Object.entries(cssVars)) {
    // Strip --sap prefix and try to find a matching Figma variable
    const varName = cssName.replace(/^--/, '');
    const figmaVar = localVars.find(v =>
      v.name === varName ||
      v.name.toLowerCase() === varName.toLowerCase() ||
      v.name.replace(/\//g, '') === varName // Figma uses / for grouping
    );

    if (figmaVar && 'fills' in node) {
      // Bind the fill to the variable instead of using hardcoded color
      try {
        const fills = (node as FrameNode).fills as Paint[];
        if (fills.length > 0 && fills[0].type === 'SOLID') {
          (node as FrameNode).setBoundVariable('fills', 0, 'color', figmaVar);
        }
      } catch { /* variable type mismatch — skip binding */ }
    }
  }
}
```

## New tool definition

```typescript
// tools/figma/create-from-element.ts

export const figmaCreateFromElement: Tool = {
  definition: {
    name: 'figma_create_from_element',
    description: 'Extract a DOM element from the preview and recreate it as a Figma design node. '
      + 'Uses deterministic CSS-to-Figma mapping for accuracy, with optional AI refinement '
      + 'for design quality (grid snapping, component recognition, content simplification). '
      + 'The element is created at the current viewport position in Figma.',
    input_schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to recreate (e.g., "app-product-catalog", ".card-container", "[_ong=\\"abc\\"]")'
        },
        depth: {
          type: 'number',
          description: 'Max depth of child elements to include. Default 5. Use 0 for just the element itself, -1 for full depth.'
        },
        refine: {
          type: 'boolean',
          description: 'Whether to apply AI refinement (grid snapping, component recognition, content simplification). Default true.'
        },
        parentNodeId: {
          type: 'string',
          description: 'Optional Figma node ID to create inside. If omitted, creates on the current page.'
        }
      },
      required: ['selector']
    },
  },

  async execute(args, ctx) {
    // 1. Extract DOM subtree via CDP
    // 2. Run deterministic CSS → Figma mapping
    // 3. Optionally refine with AI
    // 4. Send to Figma bridge
    // ... implementation details in the MVP section
  }
};
```

## Implementation plan

### MVP — Phase 1 (~2-3 days)

**Goal:** Single-element recreation with deterministic mapping. No AI refinement, no recursion beyond 1 level of children.

1. **CDP extraction expression** (`tools/figma/extract-element.ts`)
   - Takes a CSS selector
   - Extracts: bounding box, computed styles (20 key properties), text content, child count
   - Returns a flat `NodeSpec`

2. **CSS-to-Figma mapper** (`tools/figma/css-to-figma.ts`)
   - Pure function: `NodeSpec` → Figma-ready spec
   - Handles: fills, strokes, corner radius, shadows, auto-layout, text properties
   - No external dependencies

3. **Bridge command** (`apps/figma-plugin/src/code.ts`)
   - New `create_node` handler
   - Creates a single frame with all mapped properties
   - Handles text nodes
   - Returns created node ID

4. **Tool** (`tools/figma/create-from-element.ts`)
   - Orchestrates: CDP extract → map → bridge create
   - Returns: "Created frame 'Card' in Figma (320×200, 3 children)"

**Test:** Select a `ui5-card` in the preview, ask "recreate this in Figma." Should produce a Figma frame with correct colors, spacing, rounded corners, and text.

### Phase 2 (~3-5 days)

**Goal:** Recursive subtree recreation + basic AI refinement.

5. **Recursive DOM walk** — depth-limited, handles nested flex containers
6. **Image handling** — `<img>` tags and CSS `background-image` → export as PNG → create image fill
7. **AI refinement pass** — grid snapping, naming, content simplification
8. **Font loading** — `figma.loadFontAsync()` for each unique font in the subtree

**Test:** Select the entire product catalog page, ask "recreate this layout in Figma." Should produce a nested frame structure matching the page.

### Phase 3 (~1-2 weeks)

**Goal:** Component awareness + variable binding.

9. **Component recognition** — detect UI5 component tags, use Figma kit components if available
10. **Variable binding** — match `--sap*` CSS vars to Figma local variables
11. **Figma component creation** — wrap recreated elements as Figma components with variants
12. **Batch creation** — recreate multiple elements in one call (e.g., "recreate all cards")

**Test:** Select a `ui5-shellbar`, ask "recreate this in Figma using the UI5 design kit." Should swap in the kit's ShellBar component with correct props.

## Open questions

1. **Font availability.** The preview uses web fonts (e.g., SAP 72). If the Figma file doesn't have the font installed, `figma.loadFontAsync()` will fail. Fallback: use a similar system font and note the substitution.

2. **How deep to recurse?** A `ui5-shellbar` has ~50 nested DOM nodes (shadow DOM included). Most are implementation details. Should we recurse into shadow DOM, or stop at the component boundary? — *Proposal:* stop at custom element boundaries by default. The user can set `depth: -1` for full recursion.

3. **Shadow DOM access.** UI5 web components use shadow DOM. CDP's `evaluate` runs in the main document context and can access shadow roots via `element.shadowRoot`. But the recursive walker needs to explicitly enter shadow roots. — *Proposal:* enter shadow roots for known UI5 components, skip for others.

4. **Performance for large subtrees.** A full page might produce hundreds of nodes. Creating them all in Figma could be slow. — *Proposal:* show a progress indicator, create in batches of 10-20 nodes, warn if >100 nodes.

5. **Interaction with existing Figma content.** If the user has a Figma page with existing designs, where should the new nodes go? — *Proposal:* create in a new frame named after the Angular component, positioned at the viewport center. User can move it.

6. **Round-trip fidelity.** If the user goes Figma → code → Figma, will the recreated design match the original? — *Not a goal for MVP.* The recreated design will be structurally equivalent but may differ in exact variable bindings, component usage, and style organization.

## Files to create/modify

### New files
- `apps/server/src/providers/tools/figma/create-from-element.ts` — the tool
- `apps/server/src/providers/tools/figma/css-to-figma.ts` — deterministic mapper
- `apps/server/src/providers/tools/figma/extract-element.ts` — CDP extraction

### Modified files
- `apps/figma-plugin/src/code.ts` — add `create_node` command handler
- `apps/figma-plugin/src/manifest.json` — may need additional Figma API permissions
- `apps/server/src/providers/tools/figma/index.ts` — register new tool
- `apps/server/src/providers/tools/index.ts` — add to FIGMA_TOOLS group

## References

- Figma Plugin API: https://www.figma.com/plugin-docs/
- Figma Variables API: https://www.figma.com/plugin-docs/api/variables/
- Existing Figma bridge: `apps/figma-plugin/src/code.ts`, `apps/server/src/services/figma-bridge.service.ts`
- Existing Figma tools: `apps/server/src/providers/tools/figma/figma-tools.ts`
- Visual editor inspector: `libs/shared-types/src/lib/runtime-scripts/inspector.ts`
