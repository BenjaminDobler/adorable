# ToolbarSelectOption

**Type:** Component
**Selector:** `<ui5-toolbar-select-option>`
**Import:** `import { ToolbarSelectOptionComponent } from '@ui5/webcomponents-ngx/main/toolbar-select-option';`
**Export As:** `ui5ToolbarSelectOption`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-toolbar-select-option [selected]="..."></ui5-toolbar-select-option>
```

## Description
The ui5-toolbar-select-option component defines the content of an option in the ui5-toolbar-select.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `selected` | `boolean` | `false` | Defines the selected state of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |
