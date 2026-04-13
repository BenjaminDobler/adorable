# ComboBoxItem

**Type:** Component
**Selector:** `<ui5-cb-item>`
**Import:** `import { ComboBoxItemComponent } from '@ui5/webcomponents-ngx/main/combo-box-item';`
**Export As:** `ui5CbItem`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-cb-item [text]="..."></ui5-cb-item>
```

## Description
The ui5-cb-item represents the item for a ui5-combobox.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the component. |
| `additionalText` | `string | undefined` | `undefined` | Defines the additional text of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
