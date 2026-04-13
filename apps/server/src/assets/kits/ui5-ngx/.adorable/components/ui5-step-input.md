# StepInput

**Type:** Component
**Selector:** `<ui5-step-input>`
**Import:** `import { StepInputComponent } from '@ui5/webcomponents-ngx/main/step-input';`
**Export As:** `ui5StepInput`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-step-input [value]="..." (ui5Change)="onChange($event)"></ui5-step-input>
```

## Description
The ui5-step-input consists of an input field and buttons with icons to increase/decrease the value with the predefined step. The user can change the value of the component by pressing the increase/decrease buttons, by typing a number directly, by using the keyboard up/down and page up/down, or by using the mouse scroll wheel. Decimal values are supported. The default step is 1 but the app developer can set a different one. App developers can set a maximum and minimum value for the StepInput. The increase/decrease button and the up/down keyboard navigation become disabled when the value reache

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | `0` | Defines a value of the component. |
| `min` | `number | undefined` | `undefined` | Defines a minimum value of the component. |
| `max` | `number | undefined` | `undefined` | Defines a maximum value of the component. |
| `step` | `number` | `1` | Defines a step of increasing/decreasing the value of the component. |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `disabled` | `boolean` | `false` | Determines whether the component is displayed as disabled. |
| `readonly` | `boolean` | `false` | Determines whether the component is displayed as read-only. |
| `placeholder` | `string | undefined` | `undefined` | Defines a short hint, intended to aid the user with data entry when the component has no value. **Note:** When no placeh |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `valuePrecision` | `number` | `0` | Determines the number of digits after the decimal point of the component. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the input operation has finished by pressing Enter or on focusout. |
| `(ui5Input)` | ~~`(input)`~~ | Fired when the value of the component changes at each keystroke. |
| `(ui5ValueStateChange)` | ~~`(value-state-change)`~~ | Fired before the value state of the component is updated internally. The event is preventable, meaning that if it's defa |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `valueStateMessage` | Defines the value state message that will be displayed as pop up under the component. **Note:** If not specified, a default text (in the respective la |
