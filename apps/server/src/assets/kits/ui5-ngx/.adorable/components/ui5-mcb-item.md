# MultiComboBoxItem

**Type:** Component
**Selector:** `<ui5-mcb-item>`
**Import:** `import { MultiComboBoxItemComponent } from '@ui5/webcomponents-ngx/main/multi-combo-box-item';`
**Export As:** `ui5McbItem`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-mcb-item [text]="..."></ui5-mcb-item>
```

## Description
The ui5-mcb-item represents the item for a ui5-multi-combobox.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the component. |
| `additionalText` | `string | undefined` | `undefined` | Defines the additional text of the component. |
| `selected` | `boolean` | `false` | Defines the selected state of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
