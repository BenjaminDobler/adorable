# TextArea

**Type:** Component
**Selector:** `<ui5-textarea>`
**Import:** `import { TextAreaComponent } from '@ui5/webcomponents-ngx/main/text-area';`
**Export As:** `ui5Textarea`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-textarea [value]="..." (ui5Change)="onChange($event)"></ui5-textarea>
```

## Description
The ui5-textarea component is used to enter multiple rows of text. When empty, it can hold a placeholder similar to a ui5-input. You can define the rows of the ui5-textarea and also determine specific behavior when handling long texts. import "@ui5/webcomponents/dist/TextArea.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | `""` | Defines the value of the component. |
| `disabled` | `boolean` | `false` | Indicates whether the user can interact with the component or not. **Note:** A disabled component is completely noninter |
| `readonly` | `boolean` | `false` | Defines whether the component is read-only. **Note:** A read-only component is not editable, but still provides visual f |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `placeholder` | `string | undefined` | `undefined` | Defines a short hint intended to aid the user with data entry when the component has no value. |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. **Note:** If maxlength property is set, the component turns into "Critical" st |
| `rows` | `number` | `0` | Defines the number of visible text rows for the component. **Notes:** - If the growing property is enabled, this propert |
| `maxlength` | `number | undefined` | `undefined` | Defines the maximum number of characters that the value can have. |
| `showExceededText` | `boolean` | `false` | Determines whether the characters exceeding the maximum allowed character count are visible in the component. If set to  |
| `growing` | `boolean` | `false` | Enables the component to automatically grow and shrink dynamically with its content. |
| `growingMaxRows` | `number` | `0` | Defines the maximum number of rows that the component can grow. |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the textarea. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that describe the textarea. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the text has changed and the focus leaves the component. |
| `(ui5Input)` | ~~`(input)`~~ | Fired when the value of the component changes at each keystroke or when something is pasted. |
| `(ui5Select)` | ~~`(select)`~~ | Fired when some text has been selected. |
| `(ui5Scroll)` | ~~`(scroll)`~~ | Fired when textarea is scrolled. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `valueStateMessage` | Defines the value state message that will be displayed as pop up under the component. The value state message slot should contain only one root elemen |

## CSS Parts
| Name | Description |
|------|-------------|
| `textarea` | Used to style the native textarea |
