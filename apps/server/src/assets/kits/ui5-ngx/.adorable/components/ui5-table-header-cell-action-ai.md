# TableHeaderCellActionAI

**Type:** Component
**Selector:** `<ui5-table-header-cell-action-ai>`
**Import:** `import { TableHeaderCellActionAIComponent } from '@ui5/webcomponents-ngx/main/table-header-cell-action-ai';`
**Export As:** `ui5TableHeaderCellActionAi`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-header-cell-action-ai (ui5Click)="onClick($event)"></ui5-table-header-cell-action-ai>
```

## Description
The ui5-table-header-cell-action-ai component defines a dedicated AI action for the table column. import "@ui5/webcomponents/dist/TableHeaderCellActionAI.js";

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when a header cell action is clicked. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
