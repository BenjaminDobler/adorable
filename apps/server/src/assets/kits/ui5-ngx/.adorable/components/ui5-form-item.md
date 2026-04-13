# FormItem

**Type:** Component
**Selector:** `<ui5-form-item>`
**Import:** `import { FormItemComponent } from '@ui5/webcomponents-ngx/main/form-item';`
**Export As:** `ui5FormItem`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-form-item [columnSpan]="..."></ui5-form-item>
```

## Description
The FormItem (ui5-form-item) represents pair of a label and one or more components (text or text fields), associated to it. The FormItem is being used in FormGroup (ui5-form-group) or directly in Form (ui5-form). - import @ui5/webcomponents/dist/FormItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `columnSpan` | `number | undefined` | `undefined` | Defines the column span of the component, e.g how many columns the component should span to. **Note:** The column span s |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the component, associated to labelContent. |
| `labelContent` | Defines the label of the component. |

## CSS Parts
| Name | Description |
|------|-------------|
| `content` | Used to style the content part of the form item. |
| `label` | Used to style the label part of the form item. |
| `layout` | Used to style the parent element of the label and content parts. |
