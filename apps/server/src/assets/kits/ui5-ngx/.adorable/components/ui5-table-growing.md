# TableGrowing

**Type:** Component
**Selector:** `<ui5-table-growing>`
**Import:** `import { TableGrowingComponent } from '@ui5/webcomponents-ngx/main/table-growing';`
**Export As:** `ui5TableGrowing`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-growing [mode]="..." (ui5LoadMore)="onLoadMore($event)"></ui5-table-growing>
```

## Description
The ui5-table-growing component is used inside the ui5-table to add a growing/data loading functionalities to the table. The component offers two options: * Button - a More button is displayed, clicking it will load more data. * Scroll - additional data is loaded automatically when the user scrolls to the end of the table. The ui5-table-growing component is only used inside the ui5-table component as a feature. It has to be slotted inside the ui5-table in the features slot. The component is not intended to be used as a standalone component. ``html <ui5-table> <ui5-table-growing mode="Button" t

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `TableGrowingMode` | `"Button"` | Defines the mode of the <code>ui5-table</code> growing. Available options are: Button - Shows a More button at the botto |
| `text` | `string | undefined` | `undefined` | Defines the text that will be displayed inside the growing button. Has no effect when mode is set to Scroll. **Note:** W |
| `subtext` | `string | undefined` | `undefined` | Defines the text that will be displayed below the text inside the growing button. Has no effect when mode is set to Scro |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5LoadMore)` | ~~`(load-more)`~~ | Fired when the growing button is pressed or the user scrolls to the end of the table. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
