# CheckBox

**Type:** Component
**Selector:** `<ui5-checkbox>`
**Import:** `import { CheckBoxComponent } from '@ui5/webcomponents-ngx/main/check-box';`
**Export As:** `ui5Checkbox`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-checkbox [accessibleNameRef]="..." (ui5Change)="onChange($event)"></ui5-checkbox>
```

## Description
Allows the user to set a binary value, such as true/false or yes/no for an item. The ui5-checkbox component consists of a box and a label that describes its purpose. If it's checked, an indicator is displayed inside the box. To check/uncheck the ui5-checkbox, the user has to click or tap the square box or its label. The ui5-checkbox component only has 2 states - checked and unchecked. Clicking or tapping toggles the ui5-checkbox between checked and unchecked state. You can define the checkbox text with via the text property. If the text exceeds the available width, it is truncated by default. 

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. **Note:** A disabled component is completely noninteractive. |
| `readonly` | `boolean` | `false` | Defines whether the component is read-only. **Note:** A read-only component is not editable, but still provides visual f |
| `displayOnly` | `boolean` | `false` | Determines whether the ui5-checkbox is in display only state. When set to true, the ui5-checkbox is not interactive, not |
| `required` | `boolean` | `false` | Defines whether the component is required. **Note:** We advise against using the text property of the checkbox when ther |
| `indeterminate` | `boolean` | `false` | Defines whether the component is displayed as partially checked. **Note:** The indeterminate state can be set only progr |
| `checked` | `boolean` | `false` | Defines if the component is checked. **Note:** The property can be changed with user interaction, either by cliking/tapp |
| `text` | `string | undefined` | `undefined` | Defines the text of the component. |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `wrappingType` | `WrappingType` | `"Normal"` | Defines whether the component text wraps when there is not enough space. **Note:** for option "Normal" the text will wra |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `value` | `string` | `"on"` | Defines the form value of the component that is submitted when the checkbox is checked. When a form containing ui5-check |

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
| `icon` | Used to style the icon of the ui5-checkbox |
| `label` | Used to style the label of the ui5-checkbox |
| `root` | Used to style the outermost wrapper of the ui5-checkbox |
