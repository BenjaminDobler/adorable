---
name: figma-live
description: Figma Live Bridge — real-time design-to-code workflow with bidirectional Figma Desktop integration
---

# Figma Live Bridge

A live WebSocket connection to the user's Figma Desktop is active. You have direct, real-time access to the Figma document — no imports or exports needed.

## Available Figma Tools

- `figma_get_fonts` — **CALL THIS FIRST.** Get all fonts in the current page with correct CSS font-family names, font-weights, CDN URLs, and icon codepoints
- `figma_get_selection` — See what the user has selected in Figma (structure + images)
- `figma_get_node` — Inspect a specific node by ID (structure + optional image)
- `figma_export_node` — Export any node as a high-res PNG
- `figma_search_nodes` — Find elements by name in the current page
- `figma_select_node` — Select and zoom to a node in Figma (highlights it for the user)
- `figma_get_variables` — Extract design tokens (local variables) as structured JSON with resolved values per mode

## Design-to-Code Workflow

1. **Get fonts first**: ALWAYS call `figma_get_fonts` before writing any code. It returns the exact CSS `font-family` names and `font-weight` values to use, plus CDN URLs. **Figma's internal font names are different from web CSS names** (e.g., Figma says `la-solid-900` but CSS needs `font-family: 'Line Awesome Free'; font-weight: 900`). Never guess — use the `cssFontFamily` and `cssFontWeight` fields from the response.
2. **Inspect the design**: Call `figma_get_selection` to see the currently selected frame with its structure and visual export
3. **Analyze the structure**: The node tree maps roughly to HTML hierarchy — pay attention to auto-layout direction (horizontal = flexbox row, vertical = column), spacing/gap, padding, and alignment
4. **Handle icon fonts**: TEXT nodes with `isIconFont: true` and `iconCodepoint` (e.g., `"U+F015"`) are icon glyphs. Render them using the `cssFontFamily` from `figma_get_fonts` and the codepoint as CSS `content` (e.g., `content: '\f015'`). Do NOT substitute with a different icon library.
5. **Extract design tokens**: Use `figma_get_variables` to get theme colors, spacing, and typography tokens when available
6. **Implement the component**: Write Angular code that matches the design precisely
7. **Compare visually**: Use `browse_screenshot` to capture your implementation, then compare side-by-side with `figma_export_node`
8. **Iterate**: Fix discrepancies and re-check until the implementation matches

## Font Rules (Critical)

- **Never use Figma's `family` field as CSS `font-family`** — they are often different
- **Always use `cssFontFamily` and `cssFontWeight`** from `figma_get_fonts` response
- **Load fonts via the provided `cdn` or `googleFontsUrl`** — don't guess CDN links
- **For icon fonts**: use CSS `content` with the hex codepoint, e.g.:
  ```css
  .icon::before {
    font-family: 'Line Awesome Free';  /* from cssFontFamily */
    font-weight: 900;                   /* from cssFontWeight */
    content: '\f015';                   /* from iconCodepoint U+F015 */
  }
  ```
- **Never substitute icon fonts** (e.g., don't replace Line Awesome with Font Awesome)

## Code-to-Figma Sync (Reverse Sync)

When the user asks to "recreate in Figma", "push to Figma", "sync to Figma", or "create this element in Figma":

- **Use `figma_create_from_element`** — this is the ONLY tool for this task
- **Do NOT edit source code** — the user wants to create a Figma design node from the running preview, not modify code
- Provide a CSS selector or ONG annotation ID for the target element
- The tool extracts the DOM element's styles via CDP, maps CSS to Figma properties, and creates the node in Figma automatically
- Use `depth: -1` for full depth extraction, or a lower number to limit nesting

Example: if the user says "recreate the card in Figma", call `figma_create_from_element` with the card's selector.

## Finding Matching Elements (Bidirectional)

When the user asks "find/select the matching element in Figma":

1. Use `browse_screenshot` to capture the current app state
2. Identify the target element visually
3. Use `figma_search_nodes` with likely names (component name, heading text, section label)
4. Use `figma_export_node` on candidates to visually verify the match
5. Use `figma_select_node` to highlight the match in Figma — the user will see it jump to that element

## Design Audit

When comparing an implementation against the Figma source:

1. Get the Figma frame with `figma_get_selection` or `figma_get_node`
2. Screenshot the running app with `browse_screenshot`
3. Compare: colors, spacing, font sizes, border radii, shadows, dimensions
4. Report specific differences with Figma values vs. app values
5. Fix discrepancies in the code

## Efficiency Rules (Critical)

- **Gather first, write once.** Collect ALL Figma data (fonts, structure, tokens) and read ALL existing code BEFORE writing anything. Then write all changes in a single comprehensive `write_files` call. Never do iterative screenshot→fix→screenshot loops.
- **Export images ONCE.** Never re-export the same Figma node. You already have it from the first export.
- **Maximum 2 screenshots.** One after implementation, one final check. That's it.
- **No partial fixes.** If there are 5 problems, fix all 5 in one batch. Not one-at-a-time.
- **Target: 5-8 turns total.** The full workflow is: get-fonts → get-selection → export-node (once) → read files → write all → build → verify. Done.

## Tips

- Frame names in Figma often correspond to component names — use them as hints
- `absoluteBoundingBox` gives exact pixel dimensions — use for precise sizing
- Always prefer the PNG export for visual comparison over the JSON structure alone
- When implementing responsive layouts, check if Figma frames use auto-layout (they usually do)
- Limit image exports to what you need — each export adds latency
- For large/complex components, use `figma_get_node` with a `depth` parameter to fetch incrementally
- **Vector assets (logos, illustrations, icons)**: When you encounter GROUP, VECTOR, or INSTANCE nodes that represent logos, illustrations, or complex graphics that cannot be reproduced with CSS alone, use `figma_export_node` with `format: "SVG"` to export them as clean SVG markup. Inline the SVG directly in the template — never render a gray placeholder box. This applies to any visual element that isn't text, a simple shape with fills, or an icon font glyph.
