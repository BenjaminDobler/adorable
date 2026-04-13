# Tree

**Type:** Component
**Selector:** `<ui5-tree>`
**Import:** `import { TreeComponent } from '@ui5/webcomponents-ngx/main/tree';`
**Export As:** `ui5Tree`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-tree [selectionMode]="..." (ui5ItemToggle)="onItemToggle($event)"></ui5-tree>
```

## Description
The ui5-tree component provides a tree structure for displaying data in a hierarchy. - To display hierarchically structured items. - To select one or more items out of a set of hierarchically structured items. - To display items not hierarchically structured. In this case, use the List component. - To select one item from a very small number of non-hierarchical items. Select or ComboBox might be more appropriate. - The hierarchy turns out to have only two levels. In this case, use List with group items. The ui5-tree provides advanced keyboard handling. The user can use the following keyboard s

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `selectionMode` | `ListSelectionMode | undefined` | `"None"` | Defines the selection mode of the component. Since the tree uses a ui5-list to display its structure, the tree modes are |
| `noDataText` | `string | undefined` | `undefined` | Defines the text that is displayed when the component contains no items. |
| `headerText` | `string | undefined` | `undefined` | Defines the component header text. **Note:** If the header slot is set, this property is ignored. |
| `footerText` | `string | undefined` | `undefined` | Defines the component footer text. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Defines the IDs of the elements that label the component. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Defines the IDs of the elements that describe the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5ItemToggle)` | ~~`(item-toggle)`~~ | Fired when a tree item is expanded or collapsed. **Note:** You can call preventDefault() on the event object to suppress |
| `(ui5ItemMouseover)` | ~~`(item-mouseover)`~~ | Fired when the mouse cursor enters the tree item borders. |
| `(ui5ItemMouseout)` | ~~`(item-mouseout)`~~ | Fired when the mouse cursor leaves the tree item borders. |
| `(ui5ItemClick)` | ~~`(item-click)`~~ | Fired when a tree item is activated. |
| `(ui5ItemDelete)` | ~~`(item-delete)`~~ | Fired when the Delete button of any tree item is pressed. **Note:** A Delete button is displayed on each item, when the  |
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when selection is changed by user interaction in Single, SingleStart, SingleEnd and Multiple modes. |
| `(ui5Move)` | ~~`(move)`~~ | Fired when a movable tree item is moved over a potential drop target during a drag-and-drop operation. If the new positi |
| `(ui5MoveOver)` | ~~`(move-over)`~~ | Fired when a movable tree item is dropped onto a drop target. **Note:** The move event is fired only if there was a prec |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of the component. Tree items may have other tree items as children. **Note:** Use ui5-tree-item for the intended design. |
| `header` | Defines the component header. **Note:** When the header slot is set, the headerText property is ignored. |
