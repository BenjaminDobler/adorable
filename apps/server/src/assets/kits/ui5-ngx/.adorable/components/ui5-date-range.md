# CalendarDateRange

**Type:** Component
**Selector:** `<ui5-date-range>`
**Import:** `import { CalendarDateRangeComponent } from '@ui5/webcomponents-ngx/main/calendar-date-range';`
**Export As:** `ui5DateRange`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-date-range [startValue]="..."></ui5-date-range>
```

## Description
The ui5-date-range component defines a range of dates to be used inside ui5-calendar

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `startValue` | `string` | `""` | Start of date range formatted according to the formatPattern property of the ui5-calendar that hosts the component. |
| `endValue` | `string` | `""` | End of date range formatted according to the formatPattern property of the ui5-calendar that hosts the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
