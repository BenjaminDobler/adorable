# TreeItemCustom

**Type:** Component
**Selector:** `<ui5-tree-item-custom>`
**Import:** `import { TreeItemCustomComponent } from '@ui5/webcomponents-ngx/main/tree-item-custom';`
**Export As:** `ui5TreeItemCustom`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-tree-item-custom [type]="..." (ui5DetailClick)="onDetailClick($event)"></ui5-tree-item-custom>
```

## Description
The ui5-tree-item-custom represents a node in a tree structure, shown as a ui5-list. This is the item to use inside a ui5-tree. You can represent an arbitrary tree structure by recursively nesting tree items. You can use this item to put any custom content inside the tree item. import "@ui5/webcomponents/dist/TreeItemCustom.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `ListItemType` | `"Active"` | Defines the visual indication and behavior of the list items. Available options are Active (by default), Inactive, Detai |
| `accessibilityAttributes` | `ListItemAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following fields are supporte |
| `navigated` | `boolean` | `false` | The navigated state of the list item. If set to true, a navigation indicator is displayed at the end of the list item. |
| `tooltip` | `string | undefined` | `undefined` | Defines the text of the tooltip that would be displayed for the list item. |
| `highlight` | `Highlight` | `"None"` | Defines the highlight state of the list items. Available options are: "None" (by default), "Positive", "Critical", "Info |
| `selected` | `boolean` | `false` | Defines the selected state of the component. |
| `icon` | `string | undefined` | `undefined` | If set, an icon will be displayed before the text of the tree list item. |
| `expanded` | `boolean` | `false` | Defines whether the tree list item will show a collapse or expand icon inside its toggle button. |
| `movable` | `boolean` | `false` | Defines whether the item is movable. |
| `indeterminate` | `boolean` | `false` | Defines whether the selection of a tree node is displayed as partially selected. **Note:** The indeterminate state can b |
| `hasChildren` | `boolean` | `false` | Defines whether the tree node has children, even if currently no other tree nodes are slotted inside. **Note:** This pro |
| `additionalTextState` | `ValueState` | `"None"` | Defines the state of the additionalText. Available options are: "None" (by default), "Positive", "Critical", "Informatio |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible name of the component. |
| `hideSelectionElement` | `boolean` | `false` | Defines whether the tree list item should display the selection element. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5DetailClick)` | ~~`(detail-click)`~~ | Fired when the user clicks on the detail button when type is Detail. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `content` | Defines the content of the ui5-tree-item. |
| `default` | Defines the items of the component. **Note:** Use ui5-tree-item or ui5-tree-item-custom |
| `deleteButton` | Defines the delete button, displayed in "Delete" mode. **Note:** While the slot allows custom buttons, to match design guidelines, please use the ui5- |
| `image` | **Note:** While the slot allows option for setting custom avatar, to match the design guidelines, please use the ui5-avatar with size XS. **Note:** If |

## CSS Parts
| Name | Description |
|------|-------------|
| `additionalText` | Used to style the additionalText of the tree list item |
| `icon` | Used to style the icon of the tree list item |
| `title` | Used to style the title of the tree list item |
