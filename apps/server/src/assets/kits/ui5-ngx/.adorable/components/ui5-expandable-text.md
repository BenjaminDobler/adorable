# ExpandableText

**Type:** Component
**Selector:** `<ui5-expandable-text>`
**Import:** `import { ExpandableTextComponent } from '@ui5/webcomponents-ngx/main/expandable-text';`
**Export As:** `ui5ExpandableText`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-expandable-text [text]="..."></ui5-expandable-text>
```

## Description
The ui5-expandable-text component allows displaying a large body of text in a small space. It provides an "expand/collapse" functionality, which shows/hides potentially truncated text. - To accommodate long texts in limited space, for example in list items, table cell texts, or forms - The content is critical for the user. In this case use short descriptions that can fit in - Strive to provide short and meaningful texts to avoid excessive number of "Show More" links on the page On phones, if the component is configured to display the full text in a popover, the popover will appear in full scre

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Text of the component. |
| `maxCharacters` | `number` | `100` | Maximum number of characters to be displayed initially. If the text length exceeds this limit, the text will be truncate |
| `overflowMode` | `ExpandableTextOverflowMode` | `"InPlace"` | Determines how the full text will be displayed. |
| `emptyIndicatorMode` | `TextEmptyIndicatorMode` | `"Off"` | Specifies if an empty indicator should be displayed when there is no text. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
