# TableSelection

**Type:** Component
**Selector:** `<ui5-table-selection>`
**Import:** `import { TableSelectionComponent } from '@ui5/webcomponents-ngx/main/table-selection';`
**Export As:** `ui5TableSelection`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-selection [mode]="..." (ui5Change)="onChange($event)"></ui5-table-selection>
```

## Description
The ui5-table-selection component is used inside the ui5-table to add key-based selection capabilities to the ui5-table. The component offers three selection modes: * Single - select a single row. * Multiple - select multiple rows. * None - no selection active. As the selection is key-based, ui5-table-row components need to define a unique row-key property. The ui5-table-selection component is only used inside the ui5-table component as a feature. It has to be slotted inside the ui5-table in the features slot. The component is not intended to be used as a standalone component. ``html <ui5-tabl

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `TableSelectionMode` | `"Multiple"` | Defines the selection mode. |
| `selected` | `string` | `""` | Defines the selected rows separated by a space. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the selection is changed by user interaction. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
