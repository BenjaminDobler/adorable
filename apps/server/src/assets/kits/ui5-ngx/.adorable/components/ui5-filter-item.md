# FilterItem

**Type:** Component
**Selector:** `<ui5-filter-item>`
**Import:** `import { FilterItemComponent } from '@ui5/webcomponents-ngx/fiori/filter-item';`
**Export As:** `ui5FilterItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-filter-item [text]="..."></ui5-filter-item>
```

## Description
The ui5-filter-item component defines the filtering criteria for data in ui5-view-settings-dialog. It represents a single filter category that contains multiple filter options that users can select. The ui5-filter-item is used within the ui5-view-settings-dialog to provide filtering options. import "@ui5/webcomponents-fiori/dist/FilterItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the filter item. |
| `additionalText` | `string | undefined` | `undefined` | Defines the additional text of the filter item. This text is typically used to show the number of selected filter option |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `values` | Defines the filter options available for this filter category. |
