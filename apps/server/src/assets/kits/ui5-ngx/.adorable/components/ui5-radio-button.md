# RadioButton

**Type:** Component
**Selector:** `<ui5-radio-button>`
**Import:** `import { RadioButtonComponent } from '@ui5/webcomponents-ngx/main/radio-button';`
**Export As:** `ui5RadioButton`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-radio-button [disabled]="..." (ui5Change)="onChange($event)"></ui5-radio-button>
```

## Description
The ui5-radio-button component enables users to select a single option from a set of options. When a ui5-radio-button is selected by the user, the change event is fired. When a ui5-radio-button that is within a group is selected, the one that was previously selected gets automatically deselected. You can group radio buttons by using the name property. **Note:** If ui5-radio-button is not part of a group, it can be selected once, but can not be deselected back. Once the ui5-radio-button is on focus, it might be selected by pressing the Space and Enter keys. The Arrow Down/Arrow Up and Arrow Lef

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. **Note:** A disabled component is completely noninteractive. |
| `readonly` | `boolean` | `false` | Defines whether the component is read-only. **Note:** A read-only component isn't editable or selectable. However, becau |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `checked` | `boolean` | `false` | Defines whether the component is checked or not. **Note:** The property value can be changed with user interaction, eith |
| `text` | `string | undefined` | `undefined` | Defines the text of the component. |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. Radio buttons with the sa |
| `value` | `string` | `""` | Defines the form value of the component. When a form with a radio button group is submitted, the group's value will be t |
| `wrappingType` | `WrappingType` | `"Normal"` | Defines whether the component text wraps when there is not enough space. **Note:** for option "Normal" the text will wra |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Defines the IDs of the elements that label the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the component checked state changes. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## CSS Parts
| Name | Description |
|------|-------------|
| `inner-ring` | Used to style the inner ring of the ui5-radio-button. |
| `outer-ring` | Used to style the outer ring of the ui5-radio-button. |
