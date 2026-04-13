# Form

**Type:** Component
**Selector:** `<ui5-form>`
**Import:** `import { FormComponent } from '@ui5/webcomponents-ngx/main/form';`
**Export As:** `ui5Form`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-form [accessibleName]="..."></ui5-form>
```

## Description
The Form is a layout component that arranges labels and form fields (like input fields) pairs into a specific number of columns. **Note:** The Form web component is a layout component, it isn't a replacement for the native form HTML element. The Form web component does not provide any APIs for form submission. - **Form** (ui5-form) is the top-level container component, responsible for the content layout and responsiveness. - **FormGroup** (ui5-form-group) enables the grouping of the Form content. - **FormItem** (ui5-form-item) is a pair of label and form fields and can be used directly in a Fo

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Defines id (or many ids) of the element (or elements) that label the component. |
| `accessibleMode` | `FormAccessibleMode` | `"Display"` | Defines the accessibility mode of the component in "edit" and "display" use-cases. Based on the mode, the component rend |
| `layout` | `string` | `"S1 M1 L2 XL3"` | Defines the number of columns to distribute the form content by breakpoint. Supported values: - S - 1 column by default  |
| `labelSpan` | `string` | `"S12 M4 L4 XL4"` | Defines the width proportion of the labels and fields of a form item by breakpoint. By default, the labels take 4/12 (or |
| `emptySpan` | `string` | `"S0 M0 L0 XL0"` | Defines the number of cells that are empty at the end of each form item, configurable by breakpoint. By default, a form  |
| `headerText` | `string | undefined` | `undefined` | Defines the header text of the component. **Note:** The property gets overridden by the header slot. |
| `headerLevel` | `TitleLevel` | `"H2"` | Defines the compoennt heading level, set by the headerText. |
| `itemSpacing` | `FormItemSpacing` | `"Normal"` | Defines the vertical spacing between form items. **Note:** If the Form is meant to be switched between "display"("non-ed |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the component content - FormGroups or FormItems. **Note:** Mixing FormGroups and standalone FormItems (not belonging to a group) is not suppor |
| `header` | Defines the component header area. **Note:** When a header is provided, the headerText property is ignored. |

## CSS Parts
| Name | Description |
|------|-------------|
| `column` | Used to style a single column of the form column layout. |
| `header` | Used to style the wrapper of the header. |
| `layout` | Used to style the element defining the form column layout. |
