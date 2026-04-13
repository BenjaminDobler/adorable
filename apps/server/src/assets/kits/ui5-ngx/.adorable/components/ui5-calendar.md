# Calendar

**Type:** Component
**Selector:** `<ui5-calendar>`
**Import:** `import { CalendarComponent } from '@ui5/webcomponents-ngx/main/calendar';`
**Export As:** `ui5Calendar`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-calendar [primaryCalendarType]="..." (ui5SelectionChange)="onSelectionChange($event)"></ui5-calendar>
```

## Description
The ui5-calendar component allows users to select one or more dates. Currently selected dates are represented with instances of ui5-date as children of the ui5-calendar. The value property of each ui5-date must be a date string, correctly formatted according to the ui5-calendar's formatPattern property. Whenever the user changes the date selection, ui5-calendar will automatically create/remove instances of ui5-date in itself, unless you prevent this behavior by calling preventDefault() for the selection-change event. This is useful if you want to control the selected dates externally. The user

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `primaryCalendarType` | `CalendarType | undefined` | `undefined` | Sets a calendar type used for display. If not set, the calendar type of the global configuration is used. |
| `secondaryCalendarType` | `CalendarType | undefined` | `undefined` | Defines the secondary calendar type. If not set, the calendar will only show the primary calendar type. |
| `formatPattern` | `string | undefined` | `undefined` | Determines the format, displayed in the input field. |
| `displayFormat` | `string | undefined` | `undefined` | Determines the format, displayed in the input field. |
| `valueFormat` | `string | undefined` | `undefined` | Determines the format, used for the value attribute. |
| `minDate` | `string` | `""` | Determines the minimum date available for selection. **Note:** If the formatPattern property is not set, the minDate val |
| `maxDate` | `string` | `""` | Determines the maximum date available for selection. **Note:** If the formatPattern property is not set, the maxDate val |
| `calendarWeekNumbering` | `CalendarWeekNumbering` | `"Default"` | Defines how to calculate calendar weeks and first day of the week. If not set, the calendar will be displayed according  |
| `selectionMode` | `CalendarSelectionMode` | `"Single"` | Defines the type of selection used in the calendar component. Accepted property values are: - CalendarSelectionMode.Sing |
| `hideWeekNumbers` | `boolean` | `false` | Defines the visibility of the week numbers column. **Note:** For calendars other than Gregorian, the week numbers are no |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when the selected dates change. **Note:** If you call preventDefault() for this event, the component will not crea |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `calendarLegend` | Defines the calendar legend of the component. |
| `default` | Defines the selected date or dates (depending on the selectionMode property) for this calendar as instances of ui5-date or ui5-date-range. Use ui5-dat |
| `disabledDates` | Defines the disabled date ranges that cannot be selected in the calendar. Use ui5-date-range elements to specify ranges of disabled dates. Each range  |
| `specialDates` | Defines the special dates, visually emphasized in the calendar. |

## CSS Parts
| Name | Description |
|------|-------------|
| `calendar-header-arrow-button` | Used to style the calendar header navigation arrow buttons (previous/next buttons). |
| `calendar-header-middle-button` | Used to style the calendar header middle buttons (month/year/year-range buttons). |
| `day-cell` | Used to style the day cells. |
| `day-cell-selected` | Used to style the day cells when selected. |
| `day-cell-selected-between` | Used to style the day cells in between of selected dates in range. |
| `month-cell` | Used to style the month cells. |
| `month-cell-selected` | Used to style the month cells when selected. |
| `month-cell-selected-between` | Used to style the day cells in between of selected months in range. |
| `month-picker-root` | Used to style the month picker root container. |
| `year-cell` | Used to style the year cells. |
| `year-cell-selected` | Used to style the year cells when selected. |
| `year-cell-selected-between` | Used to style the year cells in between of selected years in range. |
| `year-picker-root` | Used to style the year picker root container. |
| `year-range-cell` | Used to style the year range cells. |
| `year-range-cell-selected` | Used to style the year range cells when selected. |
| `year-range-cell-selected-between` | Used to style the year range cells in between of selected year ranges. |
| `year-range-picker-root` | Used to style the year range picker root container. |
