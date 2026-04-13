# Button

**Type:** Component
**Selector:** `<ui5-button>`
**Import:** `import { ButtonComponent } from '@ui5/webcomponents-ngx/main/button';`
**Export As:** `ui5Button`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-button [design]="..." (ui5Click)="onClick($event)"></ui5-button>
```

## Description
The ui5-button component represents a simple push button. It enables users to trigger actions by clicking or tapping the ui5-button, or by pressing certain keyboard keys, such as Enter. For the ui5-button UI, you can define text, icon, or both. You can also specify whether the text or the icon is displayed first. You can choose from a set of predefined types that offer different styling to correspond to the triggered action. You can set the ui5-button as enabled or disabled. An enabled ui5-button can be pressed by clicking or tapping it. The button changes its style to provide visual feedback 

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

## Related Horizon Theme Variables
- `--sapButton_Background` = #fff
- `--sapButton_BorderColor` = #bcc3ca
- `--sapButton_BorderWidth` = .0625rem
- `--sapButton_BorderCornerRadius` = .5rem
- `--sapButton_TextColor` = #0064d9
- `--sapButton_FontFamily` = "72-SemiboldDuplex", "72-SemiboldDuplexfull", "72", "72full", Arial, Helvetica, sans-serif
- `--sapButton_Hover_Background` = #eaecee
- `--sapButton_Hover_BorderColor` = #bcc3ca
- `--sapButton_Hover_TextColor` = #0064d9
- `--sapButton_IconColor` = #0064d9
- `--sapButton_Active_Background` = #fff
- `--sapButton_Active_BorderColor` = #0064d9
- `--sapButton_Active_TextColor` = #0064d9
- `--sapButton_Emphasized_Background` = #0070f2
- `--sapButton_Emphasized_BorderColor` = #0070f2
- ...and 157 more
