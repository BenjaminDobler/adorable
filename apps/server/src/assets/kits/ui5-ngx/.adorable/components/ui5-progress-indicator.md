# ProgressIndicator

**Type:** Component
**Selector:** `<ui5-progress-indicator>`
**Import:** `import { ProgressIndicatorComponent } from '@ui5/webcomponents-ngx/main/progress-indicator';`
**Export As:** `ui5ProgressIndicator`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-progress-indicator [accessibleName]="..."></ui5-progress-indicator>
```

## Description
Shows the progress of a process in a graphical way. To indicate the progress, the inside of the component is filled with a color. You can change the size of the Progress Indicator by changing its width or height CSS properties. import "@ui5/webcomponents/dist/ProgressIndicator.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `hideValue` | `boolean` | `false` | Defines whether the component value is shown. |
| `value` | `number` | `0` | Specifies the numerical value in percent for the length of the component. **Note:** If a value greater than 100 is provi |
| `displayValue` | `string | undefined` | `undefined` | Specifies the text value to be displayed in the bar. **Note:** - If there is no value provided or the value is empty, th |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## CSS Parts
| Name | Description |
|------|-------------|
| `bar` | Used to style the main bar of the ui5-progress-indicator |
| `remaining-bar` | Used to style the remaining bar of the ui5-progress-indicator |
