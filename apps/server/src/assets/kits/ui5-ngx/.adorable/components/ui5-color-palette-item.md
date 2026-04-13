# ColorPaletteItem

**Type:** Component
**Selector:** `<ui5-color-palette-item>`
**Import:** `import { ColorPaletteItemComponent } from '@ui5/webcomponents-ngx/main/color-palette-item';`
**Export As:** `ui5ColorPaletteItem`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-color-palette-item [value]="..."></ui5-color-palette-item>
```

## Description
The ui5-color-palette-item component represents a color in the the ui5-color-palette.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | `""` | Defines the colour of the component. **Note:** The value should be a valid CSS color. |
| `selected` | `boolean` | `false` | Defines if the component is selected. **Note:** Only one item must be selected per <code>ui5-color-palette</code>. If mo |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
