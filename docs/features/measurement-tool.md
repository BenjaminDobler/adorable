# Measurement Tool

The Measurement Tool provides Figma Dev Mode-style distance measurement and layout inspection directly in the preview. Measure distances between elements, visualize padding and gaps, and inspect CSS Grid/Flexbox layouts.

## Activating Measure Mode

Click the **Measure** button (crosshair icon) in the preview toolbar. This automatically enables the Inspector if it isn't already active.

## Element Dimensions

Hover over any element to see its **width x height** displayed in a blue pill label below the element (e.g., "320 x 48").

## Distance Between Elements

1. **Click** an element to select it (the "anchor")
2. **Hover** a different element (the "target")
3. **Red measurement lines** appear showing the pixel distance between the two elements:
   - Vertical distance when elements are stacked
   - Horizontal distance when elements are side by side
   - Small perpendicular caps mark the edges being measured
   - A red pill label shows the distance in pixels

## Parent-Relative Distances

When you hover the **same element you selected**, orange dashed lines appear showing the distance from the element to all four edges of its parent container. This tells you the element's offset within its parent.

## Padding Visualization

Semi-transparent **green overlays** appear on the padding regions of hovered elements. Each padding region shows its pixel value. This works on all four sides (top, right, bottom, left).

## Gap Inspection

When hovering a **flex or grid container**, semi-transparent **pink overlays** appear in the gaps between child elements. A label shows the gap value in pixels. This works for both row and column layouts.

## Layout Overlay

### CSS Grid

When you **select** a grid container, the tool visualizes:
- **Purple dashed lines** at each column and row track boundary
- **Track size labels** showing the resolved pixel width/height of each track
- **Gap overlays** highlighting the column-gap and row-gap regions

### Flexbox

When you **select** a flex container, the tool shows:
- A **purple arrow** indicating the main axis direction (row, row-reverse, column, column-reverse)
- **Gap overlays** between flex children with gap values

## Color Reference

| Overlay | Color | Meaning |
|---------|-------|---------|
| Blue pill | Blue | Element dimensions (W x H) |
| Red lines + pills | Red/pink | Distance between two elements |
| Orange dashed lines + pills | Orange | Distance to parent edges |
| Green semi-transparent | Green | Padding regions |
| Pink semi-transparent | Pink/red | Flex/grid gaps between children |
| Purple dashed lines | Purple | Grid track boundaries / flex axis |

## Tips

- Measure mode works alongside the Inspector — your element selection is shared
- Turning off the Inspector also turns off Measure mode
- All overlays are non-interactive and won't interfere with clicking or hovering
- Overlays update live as you hover different elements
