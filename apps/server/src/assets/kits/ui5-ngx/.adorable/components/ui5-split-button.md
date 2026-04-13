# SplitButton

**Type:** Component
**Selector:** `<ui5-split-button>`
**Import:** `import { SplitButtonComponent } from '@ui5/webcomponents-ngx/main/split-button';`
**Export As:** `ui5SplitButton`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-split-button [icon]="..." (ui5Click)="onClick($event)"></ui5-split-button>
```

## Description
ui5-split-button enables users to trigger actions. It is constructed of two separate actions - default action and arrow action that can be activated by clicking or tapping, or by pressing certain keyboard keys - Space or Enter for default action, and Arrow Down or Arrow Up for arrow action. ui5-split-button consists two separate buttons: - for the first one (default action) you can define some text or an icon, or both. - the second one (arrow action) contains only slim-arrow-down icon. You can choose a design from a set of predefined types (the same as for ui5-button) that offer different styl

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `string | undefined` | `undefined` | Defines the icon to be displayed as graphical element within the component. The SAP-icons font provides numerous options |
| `activeArrowButton` | `boolean` | `false` | Defines whether the arrow button should have the active state styles or not. |
| `design` | `ButtonDesign` | `"Default"` | Defines the component design. |
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. A disabled component can't be pressed or focused, and it is not in the tab ch |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibilityAttributes` | `SplitButtonAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The accessibilityAttributes prope |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the user clicks on the default action. |
| `(ui5ArrowClick)` | ~~`(arrow-click)`~~ | Fired when the user clicks on the arrow action. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |

## CSS Parts
| Name | Description |
|------|-------------|
| `button` | Used to style the native button element |
| `endIcon` | Used to style the end icon in the native button element |
| `icon` | Used to style the icon in the native button element |
