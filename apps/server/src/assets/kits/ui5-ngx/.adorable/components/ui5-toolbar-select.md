# ToolbarSelect

**Type:** Component
**Selector:** `<ui5-toolbar-select>`
**Import:** `import { ToolbarSelectComponent } from '@ui5/webcomponents-ngx/main/toolbar-select';`
**Export As:** `ui5ToolbarSelect`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-toolbar-select [overflowPriority]="..." (ui5Change)="onChange($event)"></ui5-toolbar-select>
```

## Description
The ui5-toolbar-select component is used to create a toolbar drop-down list. The items inside the ui5-toolbar-select define the available options by using the ui5-toolbar-select-option component. import "@ui5/webcomponents/dist/ToolbarSelect.js"; import "@ui5/webcomponents/dist/ToolbarSelectOption.js"; (comes with ui5-toolbar-select)

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `overflowPriority` | `ToolbarItemOverflowBehavior` | `"Default"` | Property used to define the access of the item to the overflow Popover. If "NeverOverflow" option is set, the item never |
| `preventOverflowClosing` | `boolean` | `false` | Defines if the toolbar overflow popup should close upon interaction with the item. It will close by default. |
| `width` | `string | undefined` | `undefined` | Defines the width of the select. **Note:** all CSS sizes are supported - 'percentage', 'px', 'rem', 'auto', etc. |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `disabled` | `boolean` | `false` | Defines whether the component is in disabled state. **Note:** A disabled component is noninteractive. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the select. |
| `value` | `string | undefined` | `""` | Defines the value of the component: |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the selected option changes. |
| `(ui5Open)` | ~~`(open)`~~ | Fired after the component's dropdown menu opens. |
| `(ui5Close)` | ~~`(close)`~~ | Fired after the component's dropdown menu closes. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the component options. **Note:** Only one selected option is allowed. If more than one option is defined as selected, the last one would be co |
| `label` | Defines the HTML element that will be displayed in the component input part, representing the selected option. |
