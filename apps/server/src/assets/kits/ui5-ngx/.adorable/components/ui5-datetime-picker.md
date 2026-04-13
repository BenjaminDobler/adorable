# DateTimePicker

**Type:** Component
**Selector:** `<ui5-datetime-picker>`
**Import:** `import { DateTimePickerComponent } from '@ui5/webcomponents-ngx/main/date-time-picker';`
**Export As:** `ui5DatetimePicker`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-datetime-picker [primaryCalendarType]="..." (ui5Change)="onChange($event)"></ui5-datetime-picker>
```

## Description
The DateTimePicker component alows users to select both date (day, month and year) and time (hours, minutes and seconds) and for the purpose it consists of input field and Date/Time picker. Use the DateTimePicker if you need a combined date and time input component. Don't use it if you want to use either date, or time value. In this case, use the DatePicker or the TimePicker components instead. The user can set date/time by: - using the calendar and the time selectors - typing in the input field Programmatically, to set date/time for the DateTimePicker, use the value property The value entered

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
| `value` | `string` | `""` | Defines a formatted date value. |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `disabled` | `boolean` | `false` | Determines whether the component is displayed as disabled. |
| `readonly` | `boolean` | `false` | Determines whether the component is displayed as read-only. |
| `placeholder` | `string | undefined` | `undefined` | Defines a short hint, intended to aid the user with data entry when the component has no value. **Note:** When no placeh |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `hideWeekNumbers` | `boolean` | `false` | Defines the visibility of the week numbers column. **Note:** For calendars other than Gregorian, the week numbers are no |
| `open` | `boolean` | `false` | Defines the open or closed state of the popover. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the aria-label attribute for the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that describe the input. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the input operation has finished by pressing Enter or on focusout. |
| `(ui5Input)` | ~~`(input)`~~ | Fired when the value of the component is changed at each key stroke. |
| `(ui5ValueStateChange)` | ~~`(value-state-change)`~~ | Fired before the value state of the component is updated internally. The event is preventable, meaning that if it's defa |
| `(ui5Open)` | ~~`(open)`~~ | Fired after the component's picker is opened. |
| `(ui5Close)` | ~~`(close)`~~ | Fired after the component's picker is closed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `valueStateMessage` | Defines the value state message that will be displayed as pop up under the component. **Note:** If not specified, a default text (in the respective la |

## CSS Parts
| Name | Description |
|------|-------------|
| `input` | Used to style the input element. This part is forwarded to the underlying ui5-input element. |
