# FormGroup

**Type:** Component
**Selector:** `<ui5-form-group>`
**Import:** `import { FormGroupComponent } from '@ui5/webcomponents-ngx/main/form-group';`
**Export As:** `ui5FormGroup`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-form-group [headerText]="..."></ui5-form-group>
```

## Description
The FormGroup (ui5-form-group) represents a group inside the Form (ui5-form) component and it consists of FormItem (ui5-form-item) components. The layout of the FormGroup is mostly defined and controlled by the overarching Form (ui5-form) component. Still, one can influence the layout via the FormGroup's columnSpan property, that defines how many columns the group should expand to. Тhe FormGroup (ui5-form-group) allows to split a Form into groups, e.g to group FormItems that logically belong together. - import @ui5/webcomponents/dist/FormGroup.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `headerText` | `string | undefined` | `undefined` | Defines header text of the component. |
| `headerLevel` | `TitleLevel` | `"H3"` | Defines the compoennt heading level, set by the headerText. |
| `columnSpan` | `number | undefined` | `undefined` | Defines column span of the component, e.g how many columns the group should span to. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Defines id (or many ids) of the element (or elements) that label the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of the component. |
