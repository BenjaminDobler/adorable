# ToolbarItem

**Type:** Web Component (no Angular wrapper available)
**Selector:** `<ui5-toolbar-item>`
> **Warning:** This component has no `@ui5/webcomponents-ngx` wrapper. Consider using an alternative or check if a wrapper has been added in a newer version.
**Package:** `@ui5/webcomponents` (main)

## Description
The ui5-toolbar-item is a wrapper component used to integrate UI5 Web Components into the ui5-toolbar. It renders within the toolbar's shadow DOM and manages the lifecycle and overflow behavior of its child component. The toolbar item wraps a single UI5 Web Component (such as CheckBox, Title, etc.) and handles: - Overflow management (determining if the item should be displayed in the main toolbar or overflow popover) - Automatic popover closing on interaction - CSS custom state exposure for styling based on overflow state The ui5-toolbar-item is typically used implicitly when adding components

## Slots
| Name | Description |
|------|-------------|
| `default` | Wrapped component slot. |
