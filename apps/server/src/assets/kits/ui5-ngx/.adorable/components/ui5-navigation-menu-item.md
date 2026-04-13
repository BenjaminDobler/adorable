# NavigationMenuItem

**Type:** Web Component (no Angular wrapper available)
**Selector:** `<ui5-navigation-menu-item>`
> **Warning:** This component has no `@ui5/webcomponents-ngx` wrapper. Consider using an alternative or check if a wrapper has been added in a newer version.
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Description
ui5-navigation-menu-item is the item to use inside a ui5-navigation-menu. An arbitrary hierarchy structure can be represented by recursively nesting navigation menu items. ui5-navigation-menu-item represents a node in a ui5-navigation-menu. The navigation menu itself is rendered as a list, and each ui5-navigation-menu-item is represented by a list item in that list. Therefore, you should only use ui5-navigation-menu-item directly in your apps. The ui5-li list item is internal for the list, and not intended for public use. import "@ui5/webcomponents-fiori/dist/NavigationMenuItem.js";

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of this component. **Note:** The slot can hold menu item and menu separator items. If there are items added to this slot, an arrow w |
| `deleteButton` | Defines the delete button, displayed in "Delete" mode. **Note:** While the slot allows custom buttons, to match design guidelines, please use the ui5- |
| `endContent` | Defines the components that should be displayed at the end of the menu item. **Note:** It is highly recommended to slot only components of type ui5-bu |
