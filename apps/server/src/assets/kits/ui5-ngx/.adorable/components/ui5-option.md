# Option

**Type:** Component
**Selector:** `<ui5-option>`
**Import:** `import { OptionComponent } from '@ui5/webcomponents-ngx/main/option';`
**Export As:** `ui5Option`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-option [value]="..."></ui5-option>
```

## Description
The ui5-option component defines the content of an option in the ui5-select. import "@ui5/webcomponents/dist/Option.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string | undefined` | `undefined` | Defines the value of the ui5-select inside an HTML Form element when this component is selected. For more information on |
| `icon` | `string | undefined` | `undefined` | Defines the icon source URI. **Note:** SAP-icons font provides numerous built-in icons. To find all the available icons, |
| `additionalText` | `string | undefined` | `undefined` | Defines the additionalText, displayed in the end of the option. |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the option. |
| `selected` | `boolean` | `false` | Defines the selected state of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |
