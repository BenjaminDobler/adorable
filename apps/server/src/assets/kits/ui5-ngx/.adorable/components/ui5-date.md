# CalendarDate

**Type:** Component
**Selector:** `<ui5-date>`
**Import:** `import { CalendarDateComponent } from '@ui5/webcomponents-ngx/main/calendar-date';`
**Export As:** `ui5Date`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-date [value]="..."></ui5-date>
```

## Description
The ui5-date component defines a calendar date to be used inside ui5-calendar

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | `""` | The date formatted according to the formatPattern property of the ui5-calendar that hosts the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
