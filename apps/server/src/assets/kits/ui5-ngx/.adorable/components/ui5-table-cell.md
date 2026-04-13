# TableCell

**Type:** Component
**Selector:** `<ui5-table-cell>`
**Import:** `import { TableCellComponent } from '@ui5/webcomponents-ngx/main/table-cell';`
**Export As:** `ui5TableCell`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-cell [horizontalAlign]="..."></ui5-table-cell>
```

## Description
The ui5-table-cell represents a cell inside of a ui5-table. It is tightly coupled to the ui5-table and thus should only be used in the table component. import @ui5/webcomponents/dist/TableCell.js;

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `horizontalAlign` | `TableCellHorizontalAlign | undefined` | `undefined` | Determines the horizontal alignment of table cells. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the component. |
