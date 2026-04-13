# TableSelectionSingle

**Type:** Component
**Selector:** `<ui5-table-selection-single>`
**Import:** `import { TableSelectionSingleComponent } from '@ui5/webcomponents-ngx/main/table-selection-single';`
**Export As:** `ui5TableSelectionSingle`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-selection-single [selected]="..." (ui5Change)="onChange($event)"></ui5-table-selection-single>
```

## Description
The ui5-table-selection-single component is used inside the ui5-table to add single selection capabilities to the ui5-table. Since selection is key-based, each ui5-table-row must define a unique row-key property. The ui5-table-selection-single component is a feature designed exclusively for use within the ui5-table component. It must be placed inside the features slot of ui5-table. This component is not intended for standalone use. ``html <ui5-table> <ui5-table-selection-single slot="features" selected="Row1"></ui5-table-selection-single> </ui5-table> ` import "@ui5/webcomponents/dist/TableSel

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `selected` | `string | undefined` | `undefined` | Defines the row-key value of the selected row. |
| `behavior` | `TableSelectionBehavior` | `"RowSelector"` | Defines the selection behavior. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the selection is changed by user interaction. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
