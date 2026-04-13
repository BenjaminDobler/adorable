# RangeSlider

**Type:** Component
**Selector:** `<ui5-range-slider>`
**Import:** `import { RangeSliderComponent } from '@ui5/webcomponents-ngx/main/range-slider';`
**Export As:** `ui5RangeSlider`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-range-slider [min]="..." (ui5Change)="onChange($event)"></ui5-range-slider>
```

## Description
Represents a numerical interval and two handles (grips) to select a sub-range within it. The purpose of the component to enable visual selection of sub-ranges within a given interval. The most important properties of the Range Slider are: - min - The minimum value of the slider range. - max - The maximum value of the slider range. - value - The current value of the slider. - step - Determines the increments in which the slider will move. - showTooltip - Determines if a tooltip should be displayed above the handle. - showTickmarks - Displays a visual divider between the step values. - labelInte

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
| `startValue` | `number` | `0` | Defines start point of a selection - position of a first handle on the slider. |
| `endValue` | `number` | `100` | Defines end point of a selection - position of a second handle on the slider. |

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
| `handle` | Used to style the handles of the ui5-range-slider. |
| `progress-bar` | Used to style the progress bar, which shows the progress of the ui5-range-slider. |
| `progress-container` | Used to style the progress container, the horizontal bar that visually represents the range between  |
