# TableRowActionNavigation

**Type:** Component
**Selector:** `<ui5-table-row-action-navigation>`
**Import:** `import { TableRowActionNavigationComponent } from '@ui5/webcomponents-ngx/main/table-row-action-navigation';`
**Export As:** `ui5TableRowActionNavigation`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-row-action-navigation [invisible]="..." (ui5Click)="onClick($event)"></ui5-table-row-action-navigation>
```

## Description
The ui5-table-row-action-navigation component defines a navigation action for table rows. import "@ui5/webcomponents/dist/TableRowActionNavigation.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `invisible` | `boolean` | `false` | Defines the visibility of the row action. **Note:** Invisible row actions still take up space, allowing to hide the acti |
| `interactive` | `boolean` | `false` | Defines the interactive state of the navigation action. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when a row action is clicked. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
