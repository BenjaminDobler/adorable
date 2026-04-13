# ToggleButton

**Type:** Component
**Selector:** `<ui5-toggle-button>`
**Import:** `import { ToggleButtonComponent } from '@ui5/webcomponents-ngx/main/toggle-button';`
**Export As:** `ui5ToggleButton`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-toggle-button [design]="..." (ui5Click)="onClick($event)"></ui5-toggle-button>
```

## Description
The ui5-toggle-button component is an enhanced ui5-button that can be toggled between pressed and normal states. Users can use the ui5-toggle-button as a switch to turn a setting on or off. It can also be used to represent an independent choice similar to a check box. Clicking or tapping on a ui5-toggle-button changes its state to pressed. The button returns to its initial state when the user clicks or taps on it again. By applying additional custom CSS-styling classes, apps can give a different style to any ui5-toggle-button. import "@ui5/webcomponents/dist/ToggleButton.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `design` | `ButtonDesign` | `"Default"` | Defines the component design. |
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. A disabled component can't be pressed or focused, and it is not in the tab ch |
| `icon` | `string | undefined` | `undefined` | Defines the icon, displayed as graphical element within the component. The SAP-icons font provides numerous options. Exa |
| `endIcon` | `string | undefined` | `undefined` | Defines the icon, displayed as graphical element within the component after the button text. **Note:** It is highly reco |
| `submits` | `boolean` | `false` | When set to true, the component will automatically submit the nearest HTML form element on press. **Note:** This propert |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the component. **Note:** A tooltip attribute should be provided for icon-only buttons, in order t |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component. |
| `accessibilityAttributes` | `ButtonAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following fields are supporte |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `type` | `ButtonType` | `"Button"` | Defines whether the button has special form-related functionality. **Note:** This property is only applicable within the |
| `accessibleRole` | `ButtonAccessibleRole` | `"Button"` | Describes the accessibility role of the button. **Note:** Use <code>ButtonAccessibleRole.Link</code> role only with a pr |
| `loading` | `boolean` | `false` | Defines whether the button shows a loading indicator. **Note:** If set to true, a busy indicator component will be displ |
| `loadingDelay` | `number` | `1000` | Specifies the delay in milliseconds before the loading indicator appears within the associated button. |
| `pressed` | `boolean` | `false` | Determines whether the component is displayed as pressed. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the component is activated either with a mouse/tap or by using the Enter or Space key. **Note:** The event wi |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `badge` | Adds a badge to the button. |
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |

## CSS Parts
| Name | Description |
|------|-------------|
| `button` | Used to style the native button element |
| `endIcon` | Used to style the end icon in the native button element |
| `icon` | Used to style the icon in the native button element |
