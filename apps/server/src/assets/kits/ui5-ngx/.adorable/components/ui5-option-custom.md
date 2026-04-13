# OptionCustom

**Type:** Component
**Selector:** `<ui5-option-custom>`
**Import:** `import { OptionCustomComponent } from '@ui5/webcomponents-ngx/main/option-custom';`
**Export As:** `ui5OptionCustom`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-option-custom [displayText]="..."></ui5-option-custom>
```

## Description
The ui5-option-custom component defines a custom content of an option in the ui5-select. A component to be the same way as the standard ui5-option. The component accepts arbitrary HTML content to allow full customization. import "@ui5/webcomponents/dist/OptionCustom.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `displayText` | `string | undefined` | `undefined` | Defines the text, displayed inside the ui5-select input filed when the option gets selected. |
| `value` | `string | undefined` | `undefined` | Defines the value of the ui5-select inside an HTML Form element when this component is selected. For more information on |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the option. |
| `selected` | `boolean` | `false` | Defines the selected state of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the component. |
