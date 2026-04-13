# Token

**Type:** Component
**Selector:** `<ui5-token>`
**Import:** `import { TokenComponent } from '@ui5/webcomponents-ngx/main/token';`
**Export As:** `ui5Token`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-token [text]="..."></ui5-token>
```

## Description
Tokens are small items of information (similar to tags) that mainly serve to visualize previously selected items. import "@ui5/webcomponents/dist/Token.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the token. |
| `selected` | `boolean` | `false` | Defines whether the component is selected or not. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `closeIcon` | Defines the close icon for the token. If nothing is provided to this slot, the default close icon will be used. Accepts ui5-icon. |
