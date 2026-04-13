# ToolbarSeparator

**Type:** Component
**Selector:** `<ui5-toolbar-separator>`
**Import:** `import { ToolbarSeparatorComponent } from '@ui5/webcomponents-ngx/main/toolbar-separator';`
**Export As:** `ui5ToolbarSeparator`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-toolbar-separator [overflowPriority]="..."></ui5-toolbar-separator>
```

## Description
The ui5-toolbar-separator is an element, used for visual separation between two elements. It takes no space in calculating toolbar items width.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `overflowPriority` | `ToolbarItemOverflowBehavior` | `"Default"` | Property used to define the access of the item to the overflow Popover. If "NeverOverflow" option is set, the item never |
| `preventOverflowClosing` | `boolean` | `false` | Defines if the toolbar overflow popup should close upon interaction with the item. It will close by default. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
