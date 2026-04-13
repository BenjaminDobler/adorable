# TimePicker

**Type:** Component
**Selector:** `<ui5-time-picker>`
**Import:** `import { TimePickerComponent } from '@ui5/webcomponents-ngx/main/time-picker';`
**Export As:** `ui5TimePicker`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-time-picker [value]="..." (ui5Change)="onChange($event)"></ui5-time-picker>
```

## Description
The ui5-time-picker component provides an input field with assigned clocks which are opened on user action. The ui5-time-picker allows users to select a localized time using touch, mouse, or keyboard input. It consists of two parts: the time input field and the clocks. The user can enter a time by: - Using the clocks that are displayed in a popup - Typing it in directly in the input field When the user makes an entry and chooses the enter key, the clocks show the corresponding time (hours, minutes and seconds separately). When the user directly triggers the clocks display, the actual time is d

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | `""` | Defines a formatted time value. |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `disabled` | `boolean` | `false` | Defines the disabled state of the comonent. |
| `readonly` | `boolean` | `false` | Defines the readonly state of the comonent. |
| `placeholder` | `string | undefined` | `undefined` | Defines a short hint, intended to aid the user with data entry when the component has no value. **Note:** When no placeh |
| `formatPattern` | `string | undefined` | `undefined` | Determines the format, displayed in the input field. Example: HH:mm:ss -> 11:42:35 hh:mm:ss a -> 2:23:15 PM mm:ss -> 12: |
| `open` | `boolean` | `false` | Defines the open or closed state of the popover. |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the aria-label attribute for the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id (or many ids) of the elements that label the component. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that describe the input. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the input operation has finished by clicking the "OK" button or when the text in the input field has changed  |
| `(ui5Input)` | ~~`(input)`~~ | Fired when the value of the ui5-time-picker is changed at each key stroke. |
| `(ui5Open)` | ~~`(open)`~~ | Fired after the value-help dialog of the component is opened. |
| `(ui5Close)` | ~~`(close)`~~ | Fired after the value-help dialog of the component is closed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `valueStateMessage` | Defines the value state message that will be displayed as pop up under the ui5-time-picker. **Note:** If not specified, a default text (in the respect |

## CSS Parts
| Name | Description |
|------|-------------|
| `input` | Used to style the input element. This part is forwarded to the underlying ui5-input element. |
