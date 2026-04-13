# MultiComboBox

**Type:** Component
**Selector:** `<ui5-multi-combobox>`
**Import:** `import { MultiComboBoxComponent } from '@ui5/webcomponents-ngx/main/multi-combo-box';`
**Export As:** `ui5MultiCombobox`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-multi-combobox [value]="..." (ui5Change)="onChange($event)"></ui5-multi-combobox>
```

## Description
The ui5-multi-combobox component consists of a list box with items and a text field allowing the user to either type a value directly into the text field, or choose from the list of existing items. The drop-down list is used for selecting and filtering values, it enables users to select one or more options from a predefined list. The control provides an editable input field to filter the list, and a dropdown arrow to expand/collapse the list of available options. The options in the list have checkboxes that permit multi-selection. Entered values are displayed as tokens. The ui5-multi-combobox 

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | `""` | Defines the value of the component. **Note:** The property is updated upon typing. |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `noTypeahead` | `boolean` | `false` | Defines whether the value will be autcompleted to match an item |
| `placeholder` | `string | undefined` | `undefined` | Defines a short hint intended to aid the user with data entry when the component has no value. |
| `noValidation` | `boolean` | `false` | Defines if the user input will be prevented, if no matching item has been found |
| `disabled` | `boolean` | `false` | Defines whether the component is in disabled state. **Note:** A disabled component is completely noninteractive. |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `readonly` | `boolean` | `false` | Defines whether the component is read-only. **Note:** A read-only component is not editable, but still provides visual f |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `filter` | `ComboBoxFilter` | `"StartsWithPerTerm"` | Defines the filter type of the component. |
| `showClearIcon` | `boolean` | `false` | Defines whether the clear icon of the multi-combobox will be shown. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component. |
| `showSelectAll` | `boolean` | `false` | Determines if the select all checkbox is visible on top of suggestions. |
| `open` | `boolean` | `false` | Indicates whether the items picker is open. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the input operation has finished by pressing Enter or on focusout. |
| `(ui5Input)` | ~~`(input)`~~ | Fired when the value of the component changes at each keystroke or clear icon is pressed. |
| `(ui5Open)` | ~~`(open)`~~ | Fired when the dropdown is opened. |
| `(ui5Close)` | ~~`(close)`~~ | Fired when the dropdown is closed. |
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when selection is changed by user interaction. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the component items. |
| `icon` | Defines the icon to be displayed in the component. |
| `valueStateMessage` | Defines the value state message that will be displayed as pop up under the component. The value state message slot should contain only one root elemen |

## CSS Parts
| Name | Description |
|------|-------------|
| `token-\{index\}` | Used to style each token(where token-0 corresponds to the first item) |
