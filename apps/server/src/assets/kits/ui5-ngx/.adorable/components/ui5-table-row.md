# TableRow

**Type:** Component
**Selector:** `<ui5-table-row>`
**Import:** `import { TableRowComponent } from '@ui5/webcomponents-ngx/main/table-row';`
**Export As:** `ui5TableRow`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-table-row [rowKey]="..."></ui5-table-row>
```

## Description
The ui5-table-row component represents a row in the ui5-table. import "@ui5/webcomponents/dist/TableRow.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `rowKey` | `string | undefined` | `undefined` | Unique identifier of the row. **Note:** For selection features to work properly, this property is mandatory, and its val |
| `position` | `number | undefined` | `undefined` | Defines the 0-based position of the row related to the total number of rows within the table when the ui5-table-virtuali |
| `interactive` | `boolean` | `false` | Defines the interactive state of the row. |
| `navigated` | `boolean` | `false` | Defines the navigated state of the row. |
| `movable` | `boolean` | `false` | Defines whether the row is movable. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `actions` | Defines the actions of the component. **Note:** Use ui5-table-row-action or ui5-table-row-action-navigation for the intended design. |
| `default` | Defines the cells of the component. **Note:** Use ui5-table-cell for the intended design. |
