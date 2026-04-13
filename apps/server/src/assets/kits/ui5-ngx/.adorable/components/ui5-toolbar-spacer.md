# ToolbarSpacer

**Type:** Component
**Selector:** `<ui5-toolbar-spacer>`
**Import:** `import { ToolbarSpacerComponent } from '@ui5/webcomponents-ngx/main/toolbar-spacer';`
**Export As:** `ui5ToolbarSpacer`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-toolbar-spacer [overflowPriority]="..."></ui5-toolbar-spacer>
```

## Description
The ui5-toolbar-spacer is an element, used for taking needed space for toolbar items to take 100% width. It takes no space in calculating toolbar items width.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `overflowPriority` | `ToolbarItemOverflowBehavior` | `"Default"` | Property used to define the access of the item to the overflow Popover. If "NeverOverflow" option is set, the item never |
| `preventOverflowClosing` | `boolean` | `false` | Defines if the toolbar overflow popup should close upon interaction with the item. It will close by default. |
| `width` | `string | undefined` | `undefined` | Defines the width of the spacer. **Note:** all CSS sizes are supported - 'percentage', 'px', 'rem', 'auto', etc. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
