# TableHeaderCell

**Type:** Component
**Selector:** `<ui5-table-header-cell>`
**Import:** `import { TableHeaderCellComponent } from '@ui5/webcomponents-ngx/main/table-header-cell';`
**Export As:** `ui5TableHeaderCell`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-header-cell [horizontalAlign]="..."></ui5-table-header-cell>
```

## Description
The ui5-table-header-cell component represents a column in the ui5-table. As it is tightly coupled to the ui5-table, it should only be used in the ui5-table-header-row to ensure correct layout and design. import "@ui5/webcomponents/dist/TableHeaderCell.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `horizontalAlign` | `TableCellHorizontalAlign | undefined` | `undefined` | Determines the horizontal alignment of table cells. |
| `width` | `string | undefined` | `undefined` | Defines the width of the column. By default, the column will grow and shrink according to the available space. This will |
| `minWidth` | `string | undefined` | `undefined` | Defines the minimum width of the column. If the table is in Popin mode and the minimum width does not fit anymore, the c |
| `importance` | `number` | `0` | Defines the importance of the column. This property affects the popin behaviour. Columns with higher importance will mov |
| `popinText` | `string | undefined` | `undefined` | The text for the column when it pops in. |
| `sortIndicator` | `SortOrder` | `"None"` | Defines the sort indicator of the column. |
| `popinHidden` | `boolean` | `false` | Defines if the column is hidden in the popin. **Note:** Please be aware that hiding the column in the popin might lead t |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `action` | Defines the action of the column. **Note:** While multiple actions are technically possible, this is not supported. |
| `default` | Defines the content of the component. |
