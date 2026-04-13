# TableRowAction

**Type:** Component
**Selector:** `<ui5-table-row-action>`
**Import:** `import { TableRowActionComponent } from '@ui5/webcomponents-ngx/main/table-row-action';`
**Export As:** `ui5TableRowAction`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-row-action [invisible]="..." (ui5Click)="onClick($event)"></ui5-table-row-action>
```

## Description
The ui5-table-row-action component defines an action for table rows. import "@ui5/webcomponents/dist/TableRowAction.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `invisible` | `boolean` | `false` | Defines the visibility of the row action. **Note:** Invisible row actions still take up space, allowing to hide the acti |
| `icon` | `string` | `""` | Defines the icon of the row action. **Note:** For row actions to work properly, this property is mandatory. **Note:** SA |
| `text` | `string` | `""` | Defines the text of the row action. **Note:** For row actions to work properly, this property is mandatory. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when a row action is clicked. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
