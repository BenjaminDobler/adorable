# Element Inspector

The Element Inspector lets you click on any element in the preview to view its properties, styles, and position in the component tree.

## Activating the Inspector

Click the **Inspect** button (cursor icon) in the preview toolbar. A blue highlight follows your mouse as you hover over elements.

## Inspecting an Element

- **Hover** over any element to see a blue outline
- **Click** an element to select it — a persistent blue border appears with a tag label (e.g., `<button>.primary`)
- The **Visual Editor panel** opens on the left showing the element's computed styles: colors, typography, spacing, borders, and layout properties

## Element Hierarchy

When an element is selected, a breadcrumb trail shows its position in the DOM tree. Click any ancestor in the breadcrumb to navigate up to parent elements.

## Inline Text Editing

**Double-click** a text element to edit its content directly in the preview. Press **Enter** to save or **Escape** to cancel. The AI will update the corresponding source file automatically.

## What You Can See

- **Tag name** and CSS classes
- **Angular component** name and host element
- **Computed styles** — color, background, font size, weight, text alignment
- **Spacing** — margin and padding values on all four sides
- **Layout** — display type, flex direction, justify/align, gap
- **Border** — radius, width, color, style

## Tips

- The inspector stays active after clicking — hover other elements to compare styles
- Click the Inspect button again to deactivate
- The inspector is automatically disabled when you switch to Annotation or Multi-Annotation mode
