# Label

**Type:** Component
**Selector:** `<ui5-label>`
**Import:** `import { LabelComponent } from '@ui5/webcomponents-ngx/main/label';`
**Export As:** `ui5Label`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-label [for]="..."></ui5-label>
```

## Description
The ui5-label is a component used to represent a label for elements like input, textarea, select. The for property of the ui5-label must be the same as the id attribute of the related input element. Screen readers read out the label, when the user focuses the labelled control. The ui5-label appearance can be influenced by properties, such as required and wrappingType. The appearance of the Label can be configured in a limited way by using the design property. For a broader choice of designs, you can use custom styles. import "@ui5/webcomponents/dist/Label";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `for` | `string | undefined` | `undefined` | Defines the labeled input by providing its ID. **Note:** Can be used with both ui5-input and native input. |
| `showColon` | `boolean` | `false` | Defines whether colon is added to the component text. **Note:** Usually used in forms. |
| `required` | `boolean` | `false` | Defines whether an asterisk character is added to the component text. **Note:** Usually indicates that user input (bound |
| `wrappingType` | `WrappingType` | `"Normal"` | Defines how the text of a component will be displayed when there is not enough space. **Note:** for option "Normal" the  |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |
