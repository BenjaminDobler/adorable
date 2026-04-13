# MultiInput

**Type:** Component
**Selector:** `<ui5-multi-input>`
**Import:** `import { MultiInputComponent } from '@ui5/webcomponents-ngx/main/multi-input';`
**Export As:** `ui5MultiInput`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-multi-input [disabled]="..." (ui5Change)="onChange($event)"></ui5-multi-input>
```

## Description
A ui5-multi-input field allows the user to enter multiple values, which are displayed as ui5-token. User can choose interaction for creating tokens. Fiori Guidelines say that user should create tokens when: - Type a value in the input and press enter or focus out the input field (change event is fired) - Move between suggestion items (selection-change event is fired) - Clicking on a suggestion item (selection-change event is fired if the clicked item is different than the current value. Also change event is fired ) import "@ui5/webcomponents/dist/MultiInput.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Defines whether the component is in disabled state. **Note:** A disabled component is completely noninteractive. |
| `placeholder` | `string | undefined` | `undefined` | Defines a short hint intended to aid the user with data entry when the component has no value. |
| `readonly` | `boolean` | `false` | Defines whether the component is read-only. **Note:** A read-only component is not editable, but still provides visual f |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `noTypeahead` | `boolean` | `false` | Defines whether the value will be autcompleted to match an item |
| `type` | `InputType` | `"Text"` | Defines the HTML type of the component. **Notes:** - The particular effect of this property differs depending on the bro |
| `value` | `string` | `""` | Defines the value of the component. **Note:** The property is updated upon typing. |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `showSuggestions` | `boolean` | `false` | Defines whether the component should show suggestions, if such are present. |
| `maxlength` | `number | undefined` | `undefined` | Sets the maximum number of characters available in the input field. **Note:** This property is not compatible with the u |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the input. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that describe the input. |
| `showClearIcon` | `boolean` | `false` | Defines whether the clear icon of the input will be shown. |
| `open` | `boolean` | `false` | Defines whether the suggestions picker is open. The picker will not open if the showSuggestions property is set to false |
| `showValueHelpIcon` | `boolean` | `false` | Determines whether a value help icon will be visualized in the end of the input. Pressing the icon will fire value-help- |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the input operation has finished by pressing Enter or on focusout. |
| `(ui5Input)` | ~~`(input)`~~ | Fired when the value of the component changes at each keystroke, and when a suggestion item has been selected. |
| `(ui5Select)` | ~~`(select)`~~ | Fired when some text has been selected. |
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when the user navigates to a suggestion item via the ARROW keys, as a preview, before the final selection. |
| `(ui5Open)` | ~~`(open)`~~ | Fired when the suggestions picker is open. |
| `(ui5Close)` | ~~`(close)`~~ | Fired when the suggestions picker is closed. |
| `(ui5ValueHelpTrigger)` | ~~`(value-help-trigger)`~~ | Fired when the value help icon is pressed and F4 or ALT/OPTION + ARROW_UP/ARROW_DOWN keyboard keys are used. |
| `(ui5TokenDelete)` | ~~`(token-delete)`~~ | Fired when tokens are being deleted. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the suggestion items. **Note:** The suggestions would be displayed only if the showSuggestions property is set to true. **Note:** The <ui5-sug |
| `icon` | Defines the icon to be displayed in the component. |
| `tokens` | Defines the component tokens. |
| `valueStateMessage` | Defines the value state message that will be displayed as pop up under the component. The value state message slot should contain only one root elemen |

## CSS Parts
| Name | Description |
|------|-------------|
| `clear-icon` | Used to style the clear icon, which can be pressed to clear user input text |
| `input` | Used to style the native input element |
| `root` | Used to style the root DOM element of the Input component |
