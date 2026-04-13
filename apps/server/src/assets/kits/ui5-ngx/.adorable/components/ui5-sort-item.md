# SortItem

**Type:** Component
**Selector:** `<ui5-sort-item>`
**Import:** `import { SortItemComponent } from '@ui5/webcomponents-ngx/fiori/sort-item';`
**Export As:** `ui5SortItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-sort-item [text]="..."></ui5-sort-item>
```

## Description
The ui5-sort-item component defines the sorting criteria for data in ui5-view-settings-dialog. It represents a single sort option that users can select to organize data in ascending or descending order. The ui5-sort-item is used within the ui5-view-settings-dialog to provide sorting options. Each sort item represents a column or field by which data can be sorted. import "@ui5/webcomponents-fiori/dist/SortItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the sort item. |
| `selected` | `boolean` | `false` | Defines if the sort item is selected. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
