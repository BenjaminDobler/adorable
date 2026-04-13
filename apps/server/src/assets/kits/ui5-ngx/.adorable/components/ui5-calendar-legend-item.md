# CalendarLegendItem

**Type:** Component
**Selector:** `<ui5-calendar-legend-item>`
**Import:** `import { CalendarLegendItemComponent } from '@ui5/webcomponents-ngx/main/calendar-legend-item';`
**Export As:** `ui5CalendarLegendItem`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-calendar-legend-item [text]="..."></ui5-calendar-legend-item>
```

## Description
Each ui5-calendar-legend-item represents a legend item, displaying a color with a label. The color is determined by the type property and the label by the text property. If a ui5-special-date is used within the ui5-calendar and a type is set, clicking on a ui5-calendar-legend-item with the same type will emphasize the respective date(s) in the calendar. The ui5-calendar-legend-item is intended to be used within the ui5-calendar-legend component. import "@ui5/webcomponents/dist/CalendarLegendItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text content of the Calendar Legend Item. |
| `type` | `CalendarLegendItemType` | `"None"` | Defines the type of the Calendar Legend Item. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
