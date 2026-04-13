# ComboBox

**Type:** Component
**Selector:** `<ui5-combobox>`
**Import:** `import { ComboBoxComponent } from '@ui5/webcomponents-ngx/main/combo-box';`
**Export As:** `ui5Combobox`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-combobox [value]="..." (ui5Change)="onChange($event)"></ui5-combobox>
```

## Description
The ui5-combobox component represents a drop-down menu with a list of the available options and a text input field to narrow down the options. It is commonly used to enable users to select an option from a predefined list. The ui5-combobox consists of the following elements: - Input field - displays the selected option or a custom user entry. Users can type to narrow down the list or enter their own value. - Drop-down arrow - expands\collapses the option list. - Option list - the list of available options. The ComboBox offers two ways to work with item selection: **1. Display Text Only (using 

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | `""` | Defines the value of the component. |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `noTypeahead` | `boolean` | `false` | Defines whether the value will be autocompleted to match an item |
| `placeholder` | `string | undefined` | `undefined` | Defines a short hint intended to aid the user with data entry when the component has no value. |
| `disabled` | `boolean` | `false` | Defines whether the component is in disabled state. **Note:** A disabled component is completely noninteractive. |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `readonly` | `boolean` | `false` | Defines whether the component is read-only. **Note:** A read-only component is not editable, but still provides visual f |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `loading` | `boolean` | `false` | Indicates whether a loading indicator should be shown in the picker. |
| `filter` | `ComboBoxFilter` | `"StartsWithPerTerm"` | Defines the filter type of the component. |
| `showClearIcon` | `boolean` | `false` | Defines whether the clear icon of the combobox will be shown. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component |
| `open` | `boolean` | `false` | Indicates whether the items picker is open. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the input operation has finished by pressing Enter, focusout or an item is selected. |
| `(ui5Open)` | ~~`(open)`~~ | Fired when the dropdown is opened. |
| `(ui5Close)` | ~~`(close)`~~ | Fired when the dropdown is closed. |
| `(ui5Input)` | ~~`(input)`~~ | Fired when typing in input or clear icon is pressed. **Note:** filterValue property is updated, input is changed. |
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when selection is changed by user interaction |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the component items. |
| `icon` | Defines the icon to be displayed in the input field. |
| `valueStateMessage` | Defines the value state message that will be displayed as pop up under the component. The value state message slot should contain only one root elemen |
