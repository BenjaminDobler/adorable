# CalendarLegend

**Type:** Component
**Selector:** `<ui5-calendar-legend>`
**Import:** `import { CalendarLegendComponent } from '@ui5/webcomponents-ngx/main/calendar-legend';`
**Export As:** `ui5CalendarLegend`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-calendar-legend [hideToday]="..."></ui5-calendar-legend>
```

## Description
The ui5-calendar-legend component is designed for use within the ui5-calendar to display a legend. Each ui5-calendar-legend-item represents a unique date type, specifying its visual style and a corresponding textual label. import "@ui5/webcomponents/dist/CalendarLegend.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `hideToday` | `boolean` | `false` | Hides the Today item in the legend. |
| `hideSelectedDay` | `boolean` | `false` | Hides the Selected day item in the legend. |
| `hideNonWorkingDay` | `boolean` | `false` | Hides the Non-Working day item in the legend. |
| `hideWorkingDay` | `boolean` | `false` | Hides the Working day item in the legend. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of the component. |
