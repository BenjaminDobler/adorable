# SuggestionItem

**Type:** Component
**Selector:** `<ui5-suggestion-item>`
**Import:** `import { SuggestionItemComponent } from '@ui5/webcomponents-ngx/main/suggestion-item';`
**Export As:** `ui5SuggestionItem`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-suggestion-item [text]="..."></ui5-suggestion-item>
```

## Description
The ui5-suggestion-item represents the suggestion item of the ui5-input.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the component. |
| `additionalText` | `string | undefined` | `undefined` | Defines the additionalText, displayed in the end of the item. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
