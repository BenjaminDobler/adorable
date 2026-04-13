# DynamicDateRange

**Type:** Component
**Selector:** `<ui5-dynamic-date-range>`
**Import:** `import { DynamicDateRangeComponent } from '@ui5/webcomponents-ngx/main/dynamic-date-range';`
**Export As:** `ui5DynamicDateRange`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-dynamic-date-range [value]="..." (ui5Change)="onChange($event)"></ui5-dynamic-date-range>
```

## Description
The ui5-dynamic-date-range component provides a flexible interface to define date ranges using a combination of absolute dates, relative intervals, and preset ranges (e.g., "Today", "Yesterday", etc.). It allows users to select a date range from a predefined set of options or enter custom dates. The component is typically used in scenarios where users need to filter data based on date ranges, such as in reports, dashboards, or data analysis tools. It can be used with the predefined options or extended with custom options to suit specific requirements. You can create your own options by extendi

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `DynamicDateRangeValue | undefined` | `undefined` | Defines the value object. |
| `options` | `string` | `""` | Defines the options listed as a string, separated by commas and using capital case. Example: "TODAY, YESTERDAY, DATERANG |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the input operation has finished by pressing Enter or on focusout or a value is selected in the popover. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
