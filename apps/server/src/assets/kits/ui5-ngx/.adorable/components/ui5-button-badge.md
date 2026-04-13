# ButtonBadge

**Type:** Component
**Selector:** `<ui5-button-badge>`
**Import:** `import { ButtonBadgeComponent } from '@ui5/webcomponents-ngx/main/button-badge';`
**Export As:** `ui5ButtonBadge`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-button-badge [design]="..."></ui5-button-badge>
```

## Description
The ui5-button-badge component defines a badge that appears in the ui5-button. import "@ui5/webcomponents/dist/ButtonBadge.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `design` | `ButtonBadgeDesign` | `"AttentionDot"` | Defines the badge placement and appearance. - **InlineText** - displayed inside the button after its text, and recommend |
| `text` | `string` | `""` | Defines the text of the component. **Note:** Text is not applied when the design property is set to AttentionDot. **Note |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
