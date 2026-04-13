# SuggestionItemCustom

**Type:** Component
**Selector:** `<ui5-suggestion-item-custom>`
**Import:** `import { SuggestionItemCustomComponent } from '@ui5/webcomponents-ngx/main/suggestion-item-custom';`
**Export As:** `ui5SuggestionItemCustom`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-suggestion-item-custom [text]="..."></ui5-suggestion-item-custom>
```

## Description
The ui5-suggestion-item-custom is type of suggestion item, that can be used to place suggestion items with custom content in the input. The text property is considered only for autocomplete. In case the user needs highlighting functionality, check "@ui5/webcomponents-base/dist/util/generateHighlightedMarkup.js"

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the ui5-suggestion-item-custom. **Note:** The text property is considered only for autocomplete. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the component. |
