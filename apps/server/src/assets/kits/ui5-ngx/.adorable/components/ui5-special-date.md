# SpecialCalendarDate

**Type:** Component
**Selector:** `<ui5-special-date>`
**Import:** `import { SpecialCalendarDateComponent } from '@ui5/webcomponents-ngx/main/special-calendar-date';`
**Export As:** `ui5SpecialDate`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-special-date [value]="..."></ui5-special-date>
```

## Description
The ui5-special-date component defines a special calendar date to be used inside ui5-calendar, which is visually distinguished from the rest of the dates.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | `""` | The date formatted according to the formatPattern property of the ui5-calendar that hosts the component. |
| `type` | `CalendarLegendItemType` | `"None"` | Defines the type of the special date. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
