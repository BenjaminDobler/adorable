# ToolbarButton

**Type:** Component
**Selector:** `<ui5-toolbar-button>`
**Import:** `import { ToolbarButtonComponent } from '@ui5/webcomponents-ngx/main/toolbar-button';`
**Export As:** `ui5ToolbarButton`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-toolbar-button [overflowPriority]="..." (ui5Click)="onClick($event)"></ui5-toolbar-button>
```

## Description
The ui5-toolbar-button represents an abstract action, used in the ui5-toolbar. import "@ui5/webcomponents/dist/ToolbarButton.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `overflowPriority` | `ToolbarItemOverflowBehavior` | `"Default"` | Property used to define the access of the item to the overflow Popover. If "NeverOverflow" option is set, the item never |
| `preventOverflowClosing` | `boolean` | `false` | Defines if the toolbar overflow popup should close upon interaction with the item. It will close by default. |
| `disabled` | `boolean` | `false` | Defines if the action is disabled. **Note:** a disabled action can't be pressed or focused, and it is not in the tab cha |
| `design` | `ButtonDesign` | `"Default"` | Defines the action design. |
| `icon` | `string | undefined` | `undefined` | Defines the icon source URI. **Note:** SAP-icons font provides numerous buil-in icons. To find all the available icons,  |
| `endIcon` | `string | undefined` | `undefined` | Defines the icon, displayed as graphical element within the component after the button text. **Note:** It is highly reco |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the component. **Note:** A tooltip attribute should be provided for icon-only buttons, in order t |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component. |
| `accessibilityAttributes` | `ToolbarButtonAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following fields are supporte |
| `text` | `string | undefined` | `undefined` | Button text |
| `showOverflowText` | `boolean` | `false` | Defines whether the button text should only be displayed in the overflow popover. When set to true, the button appears a |
| `width` | `string | undefined` | `undefined` | Defines the width of the button. **Note:** all CSS sizes are supported - 'percentage', 'px', 'rem', 'auto', etc. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the component is activated either with a mouse/tap or by using the Enter or Space key. **Note:** The event wi |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
