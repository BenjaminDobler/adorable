# Slider

**Type:** Component
**Selector:** `<ui5-slider>`
**Import:** `import { SliderComponent } from '@ui5/webcomponents-ngx/main/slider';`
**Export As:** `ui5Slider`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-slider [min]="..." (ui5Change)="onChange($event)"></ui5-slider>
```

## Description
The Slider component represents a numerical range and a handle (grip). The purpose of the component is to enable visual selection of a value in a continuous numerical range by moving an adjustable handle. The most important properties of the Slider are: - min - The minimum value of the slider range. - max - The maximum value of the slider range. - value - The current value of the slider range. - step - Determines the increments in which the slider will move. - showTooltip - Determines if a tooltip should be displayed above the handle. - showTickmarks - Displays a visual divider between the ste

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `min` | `number` | `0` | Defines the minimum value of the slider. |
| `max` | `number` | `100` | Defines the maximum value of the slider. |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `step` | `number` | `1` | Defines the size of the slider's selection intervals (e.g. min = 0, max = 10, step = 5 would result in possible selectio |
| `labelInterval` | `number` | `0` | Displays a label with a value on every N-th step. **Note:** The step and tickmarks properties must be enabled. Example - |
| `showTickmarks` | `boolean` | `false` | Enables tickmarks visualization for each step. **Note:** The step must be a positive number. |
| `showTooltip` | `boolean` | `false` | Enables handle tooltip displaying the current value. |
| `editableTooltip` | `boolean` | `false` | Indicates whether input fields should be used as tooltips for the handles. **Note:** Setting this option to true will on |
| `disabled` | `boolean` | `false` | Defines whether the slider is in disabled state. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `value` | `number` | `0` | Current value of the slider |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the value changes and the user has finished interacting with the slider. |
| `(ui5Input)` | ~~`(input)`~~ | Fired when the value changes due to user interaction that is not yet finished - during mouse/touch dragging. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## CSS Parts
| Name | Description |
|------|-------------|
| `handle` | Used to style the handle of the ui5-slider. |
| `progress-bar` | Used to style the progress bar, which shows the progress of the ui5-slider. |
| `progress-container` | Used to style the progress container, the horizontal bar that visually represents the range between  |

## Related Horizon Theme Variables
- `--sapSlider_Background` = #d5dadd
- `--sapSlider_BorderColor` = #d5dadd
- `--sapSlider_Selected_Background` = #0064d9
- `--sapSlider_Selected_BorderColor` = #0064d9
- `--sapSlider_Selected_Dimension` = .125rem
- `--sapSlider_HandleBackground` = #fff
- `--sapSlider_HandleBorderColor` = #b0d5ff
- `--sapSlider_RangeHandleBackground` = #fff
- `--sapSlider_Hover_HandleBackground` = #d9ecff
- `--sapSlider_Hover_HandleBorderColor` = #b0d5ff
- `--sapSlider_Hover_RangeHandleBackground` = #d9ecff
- `--sapSlider_Active_HandleBackground` = #fff
- `--sapSlider_Active_HandleBorderColor` = #0064d9
- `--sapSlider_Active_RangeHandleBackground` = transparent
