# Text

**Type:** Component
**Selector:** `<ui5-text>`
**Import:** `import { TextComponent } from '@ui5/webcomponents-ngx/main/text';`
**Export As:** `ui5Text`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-text [maxLines]="..."></ui5-text>
```

## Description
The ui5-text component displays text that can be used in any content area of an application. - Use the ui5-text if you want to display text inside a form, table, or any other content area. - Do not use the ui5-text if you need to reference input type of components (use ui5-label). The ui5-text component is fully adaptive to all screen sizes. By default, the text will wrap when the space is not enough. In addition, the component supports truncation via the max-lines property, by defining the number of lines the text should wrap before start truncating. import "@ui5/webcomponents/dist/Text";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `maxLines` | `number` | `Infinity` | Defines the number of lines the text should wrap before it truncates. |
| `emptyIndicatorMode` | `TextEmptyIndicatorMode` | `"Off"` | Specifies if an empty indicator should be displayed when there is no text. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. |

## Related Horizon Theme Variables
- `--sapTextColor` = #131e29
