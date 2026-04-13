# TableSelectionMulti

**Type:** Component
**Selector:** `<ui5-table-selection-multi>`
**Import:** `import { TableSelectionMultiComponent } from '@ui5/webcomponents-ngx/main/table-selection-multi';`
**Export As:** `ui5TableSelectionMulti`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-selection-multi [selected]="..." (ui5Change)="onChange($event)"></ui5-table-selection-multi>
```

## Description
The ui5-table-selection-multi component is used inside the ui5-table to add multi-selection capabilities to the ui5-table. Since selection is key-based, each ui5-table-row must define a unique row-key property. The ui5-table-selection-multi component is a feature designed exclusively for use within the ui5-table component. It must be placed inside the features slot of ui5-table. This component is not intended for standalone use. ``html <ui5-table> <ui5-table-selection-multi slot="features" selected="Row1 Row3"></ui5-table-selection-multi> </ui5-table> ` import "@ui5/webcomponents/dist/TableSel

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `selected` | `string | undefined` | `undefined` | Defines the row-key values of selected rows, with each value separated by a space. |
| `behavior` | `TableSelectionBehavior` | `"RowSelector"` | Defines the selection behavior. |
| `headerSelector` | `TableSelectionMultiHeaderSelector` | `"SelectAll"` | Defines the selector of the header row. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the selection is changed by user interaction. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
