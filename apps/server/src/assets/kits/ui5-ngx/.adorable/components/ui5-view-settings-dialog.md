# ViewSettingsDialog

**Type:** Component
**Selector:** `<ui5-view-settings-dialog>`
**Import:** `import { ViewSettingsDialogComponent } from '@ui5/webcomponents-ngx/fiori/view-settings-dialog';`
**Export As:** `ui5ViewSettingsDialog`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-view-settings-dialog [sortDescending]="..." (ui5Confirm)="onConfirm($event)"></ui5-view-settings-dialog>
```

## Description
The ui5-view-settings-dialog component helps the user to sort data within a list or a table. It consists of several lists like Sort order which is built-in and Sort By and Filter By lists, for which you must be provide items(ui5-sort-item & ui5-filter-item respectively) These options can be used to create sorters for a table. The ui5-view-settings-dialog interrupts the current application processing as it is the only focused UI element and the main screen is dimmed/blocked. The ui5-view-settings-dialog is modal, which means that user action is required before returning to the parent window is 

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `sortDescending` | `boolean` | `false` | Defines the initial sort order. |
| `groupDescending` | `boolean` | `false` | Defines the initial group order. |
| `open` | `boolean` | `false` | Indicates if the dialog is open. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Confirm)` | ~~`(confirm)`~~ | Fired when confirmation button is activated. |
| `(ui5Cancel)` | ~~`(cancel)`~~ | Fired when cancel button is activated. |
| `(ui5BeforeOpen)` | ~~`(before-open)`~~ | Fired before the component is opened. |
| `(ui5Open)` | ~~`(open)`~~ | Fired after the dialog is opened. |
| `(ui5Close)` | ~~`(close)`~~ | Fired after the dialog is closed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `filterItems` | Defines the filterItems list. **Note:** If you want to use this slot, you need to import used item: import "@ui5/webcomponents-fiori/dist/FilterItem.j |
| `groupItems` | Defines the list of items against which the user could group data. **Note:** If you want to use this slot, you need to import used item: import "@ui5/ |
| `sortItems` | Defines the list of items against which the user could sort data. **Note:** If you want to use this slot, you need to import used item: import "@ui5/w |

## CSS Parts
| Name | Description |
|------|-------------|
| `header` | Used to style the header. |
