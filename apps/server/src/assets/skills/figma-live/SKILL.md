---
name: figma-live
description: Figma Live Bridge — real-time design-to-code workflow with bidirectional Figma Desktop integration
---

# Figma Live Bridge

A live WebSocket connection to the user's Figma Desktop is active. You have direct, real-time access to the Figma document — no imports or exports needed.

## Available Figma Tools

- `figma_get_selection` — See what the user has selected in Figma (structure + images)
- `figma_get_node` — Inspect a specific node by ID (structure + optional image)
- `figma_export_node` — Export any node as a high-res PNG
- `figma_search_nodes` — Find elements by name in the current page
- `figma_select_node` — Select and zoom to a node in Figma (highlights it for the user)

## Design-to-Code Workflow

1. **Inspect the design**: Call `figma_get_selection` to see the currently selected frame with its structure and visual export
2. **Analyze the structure**: The node tree maps roughly to HTML hierarchy — pay attention to auto-layout direction (horizontal = flexbox row, vertical = column), spacing/gap, padding, and alignment
3. **Extract design details**: Note colors from fills, font sizes from text nodes, border radii, shadows from effects, and dimensions from bounding boxes
4. **Implement the component**: Write Angular code that matches the design precisely
5. **Compare visually**: Use `browse_screenshot` to capture your implementation, then compare side-by-side with `figma_export_node`
6. **Iterate**: Fix discrepancies and re-check until the implementation matches

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

## Tips

- Frame names in Figma often correspond to component names — use them as hints
- `absoluteBoundingBox` gives exact pixel dimensions — use for precise sizing
- Always prefer the PNG export for visual comparison over the JSON structure alone
- When implementing responsive layouts, check if Figma frames use auto-layout (they usually do)
- Limit image exports to what you need — each export adds latency
