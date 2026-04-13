# Title

**Type:** Component
**Selector:** `<ui5-title>`
**Import:** `import { TitleComponent } from '@ui5/webcomponents-ngx/main/title';`
**Export As:** `ui5Title`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-title [wrappingType]="..."></ui5-title>
```

## Description
The ui5-title component is used to display titles inside a page. It is a simple, large-sized text with explicit header/title semantics. import "@ui5/webcomponents/dist/Title.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `wrappingType` | `WrappingType` | `"Normal"` | Defines how the text of a component will be displayed when there is not enough space. **Note:** for option "Normal" the  |
| `level` | `TitleLevel` | `"H2"` | Defines the component level. Available options are: "H6" to "H1". This property does not influence the style of the comp |
| `size` | `TitleLevel` | `"H5"` | Defines the visual appearance of the title. Available options are: "H6" to "H1". |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. This component supports nesting a Link component inside. **Note:** Although this slot accepts HTML Elements, it is  |

## Related Horizon Theme Variables
- `--sapTitleColor` = #131e29
