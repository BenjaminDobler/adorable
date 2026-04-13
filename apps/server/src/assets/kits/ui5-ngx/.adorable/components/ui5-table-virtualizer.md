# TableVirtualizer

**Type:** Component
**Selector:** `<ui5-table-virtualizer>`
**Import:** `import { TableVirtualizerComponent } from '@ui5/webcomponents-ngx/main/table-virtualizer';`
**Export As:** `ui5TableVirtualizer`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-virtualizer [rowHeight]="..." (ui5RangeChange)="onRangeChange($event)"></ui5-table-virtualizer>
```

## Description
The ui5-table-virtualizer component is used inside the ui5-table to virtualize the table rows, if the overflowMode property of the table is set to 'Scroll'. It is responsible for rendering only the rows that are visible in the viewport and updating them on scroll. This allows large numbers of rows to exist, but maintain high performance by only paying the cost for those that are currently visible. **Note:** The maximum number of virtualized rows is limited by browser constraints, specifically the maximum supported height for a DOM element. import "@ui5/webcomponents/dist/TableVirtualizer.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `rowHeight` | `number` | `45` | Defines the height of the rows in the table. **Note:** For virtualization to work properly, this property is mandatory. |
| `rowCount` | `number` | `100` | Defines the total count of rows in the table. **Note:** For virtualization to work properly, this property is mandatory. |
| `extraRows` | `number` | `0` | Defines the count of extra rows to be rendered at the top and bottom of the table. **Note:** This property is experiment |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5RangeChange)` | ~~`(range-change)`~~ | Fired when the virtualizer is changed by user interaction e.g. on scrolling. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
