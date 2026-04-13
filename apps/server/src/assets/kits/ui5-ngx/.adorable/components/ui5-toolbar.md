# Toolbar

**Type:** Component
**Selector:** `<ui5-toolbar>`
**Import:** `import { ToolbarComponent } from '@ui5/webcomponents-ngx/main/toolbar';`
**Export As:** `ui5Toolbar`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-toolbar [alignContent]="..."></ui5-toolbar>
```

## Description
The ui5-toolbar component is used to create a horizontal layout with items. The items can be overflowing in a popover, when the space is not enough to show all of them. The ui5-toolbar provides advanced keyboard handling. - The control is not interactive, but can contain of interactive elements - [Tab] - iterates through elements import "@ui5/webcomponents/dist/Toolbar.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `alignContent` | `ToolbarAlign` | `"End"` | Indicated the direction in which the Toolbar items will be aligned. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the input. |
| `design` | `ToolbarDesign` | `"Solid"` | Defines the toolbar design. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of the component. **Note:** Currently only ui5-toolbar-button, ui5-toolbar-select, ui5-toolbar-separator and ui5-toolbar-spacer are  |

## Related Horizon Theme Variables
- `--sapToolbar_Background` = #fff
- `--sapToolbar_SeparatorColor` = #d9d9d9
