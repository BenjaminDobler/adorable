# Select

**Type:** Component
**Selector:** `<ui5-select>`
**Import:** `import { SelectComponent } from '@ui5/webcomponents-ngx/main/select';`
**Export As:** `ui5Select`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-select [disabled]="..." (ui5Change)="onChange($event)"></ui5-select>
```

## Description
The ui5-select component is used to create a drop-down list. There are two main usages of the ui5-select>. - With Option (ui5-option) web component: The available options of the Select are defined by using the Option component. The Option comes with predefined design and layout, including icon, text and additional-text. - With OptionCustom (ui5-option-custom) web component. Options with custom content are defined by using the OptionCustom component. The OptionCustom component comes with no predefined layout and it expects consumers to define it. The options can be selected via user interaction

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Defines whether the component is in disabled state. **Note:** A disabled component is noninteractive. |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `readonly` | `boolean` | `false` | Defines whether the component is read-only. **Note:** A read-only component is not editable, but still provides visual f |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the select. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that describe the select. |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the select. |
| `textSeparator` | `SelectTextSeparator` | `"Dash"` | Defines the separator type for the two columns layout when Select is in read-only mode. |
| `value` | `string` | `""` | Defines the value of the component: - when get - returns the value of the component or the value/text content of the sel |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the selected option changes. |
| `(ui5LiveChange)` | ~~`(live-change)`~~ | Fired when the user navigates through the options, but the selection is not finalized, or when pressing the ESC key to r |
| `(ui5Open)` | ~~`(open)`~~ | Fired after the component's dropdown menu opens. |
| `(ui5Close)` | ~~`(close)`~~ | Fired after the component's dropdown menu closes. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the component options. **Note:** Only one selected option is allowed. If more than one option is defined as selected, the last one would be co |
| `label` | Defines the HTML element that will be displayed in the component input part, representing the selected option. **Note:** If not specified and ui5-opti |
| `valueStateMessage` | Defines the value state message that will be displayed as pop up under the component. **Note:** If not specified, a default text (in the respective la |

## CSS Parts
| Name | Description |
|------|-------------|
| `popover` | Used to style the popover element |
