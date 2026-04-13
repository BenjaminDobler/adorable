# Table

**Type:** Component
**Selector:** `<ui5-table>`
**Import:** `import { TableComponent } from '@ui5/webcomponents-ngx/main/table';`
**Export As:** `ui5Table`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table [accessibleName]="..." (ui5RowClick)="onRowClick($event)"></ui5-table>
```

## Description
The ui5-table component provides a set of sophisticated features for displaying and dealing with vast amounts of data in a responsive manner. To render the ui5-table, you need to define the columns and rows. You can use the provided ui5-table-header-row and ui5-table-row components for this purpose. The ui5-table can be enhanced in its functionalities by applying different features. Features can be slotted into the features slot, to enable them in the component. Features need to be imported separately, as they are not enabled by default. The following features are currently available: * [Table

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Identifies the element (or elements) that labels the component. |
| `noDataText` | `string | undefined` | `undefined` | Defines the text to be displayed when there are no rows in the component. |
| `overflowMode` | `TableOverflowMode` | `"Scroll"` | Defines the mode of the <code>ui5-table</code> overflow behavior. Available options are: <code>Scroll</code> - Columns a |
| `loading` | `boolean` | `false` | Defines if the loading indicator should be shown. **Note:** When the component is loading, it is not interactive. |
| `loadingDelay` | `number` | `1000` | Defines the delay in milliseconds, after which the loading indicator will show up for this component. |
| `rowActionCount` | `number` | `0` | Defines the maximum number of row actions that is displayed, which determines the width of the row action column. **Note |
| `alternateRowColors` | `boolean` | `false` | Determines whether the table rows are displayed with alternating background colors. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5RowClick)` | ~~`(row-click)`~~ | Fired when an interactive row is clicked. **Note:** This event is not fired if the behavior property of the selection co |
| `(ui5MoveOver)` | ~~`(move-over)`~~ | Fired when a movable item is moved over a potential drop target during a dragging operation. If the new position is vali |
| `(ui5Move)` | ~~`(move)`~~ | Fired when a movable list item is dropped onto a drop target. **Notes:** The move event is fired only if there was a pre |
| `(ui5RowActionClick)` | ~~`(row-action-click)`~~ | Fired when a row action is clicked. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the rows of the component. **Note:** Use ui5-table-row for the intended design. |
| `features` | Defines the features of the component. |
| `headerRow` | Defines the header row of the component. **Note:** Use ui5-table-header-row for the intended design. |
| `noData` | Defines the custom visualization if there is no data available. |
