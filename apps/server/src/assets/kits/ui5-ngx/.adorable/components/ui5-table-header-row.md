# TableHeaderRow

**Type:** Component
**Selector:** `<ui5-table-header-row>`
**Import:** `import { TableHeaderRowComponent } from '@ui5/webcomponents-ngx/main/table-header-row';`
**Export As:** `ui5TableHeaderRow`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-header-row [sticky]="..."></ui5-table-header-row>
```

## Description
The ui5-table-header-row component represents the table headers of a ui5-table. It is tightly coupled to the ui5-table and should therefore be used in the ui5-table only. The header row is placed in the headerRow slot of the table. import "@ui5/webcomponents/dist/TableHeaderRow.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `sticky` | `boolean` | `false` | Sticks the ui5-table-header-row to the top of a table. Note: If used in combination with overflowMode "Scroll", the tabl |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the cells of the component. **Note:** Use ui5-table-header-cell for the intended design. |
