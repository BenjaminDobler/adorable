# FilterItemOption

**Type:** Component
**Selector:** `<ui5-filter-item-option>`
**Import:** `import { FilterItemOptionComponent } from '@ui5/webcomponents-ngx/fiori/filter-item-option';`
**Export As:** `ui5FilterItemOption`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-filter-item-option [text]="..."></ui5-filter-item-option>
```

## Description
The ui5-filter-item-option component defines individual filter values within a ui5-filter-item. It represents a single selectable option that users can choose to filter data. The ui5-filter-item-option is used as a child component within ui5-filter-item in the context of ui5-view-settings-dialog. Each option represents a specific value that can be used for filtering import "@ui5/webcomponents-fiori/dist/FilterItemOption.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the filter option. |
| `selected` | `boolean` | `false` | Defines if the filter option is selected. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
