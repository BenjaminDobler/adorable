# RatingIndicator

**Type:** Component
**Selector:** `<ui5-rating-indicator>`
**Import:** `import { RatingIndicatorComponent } from '@ui5/webcomponents-ngx/main/rating-indicator';`
**Export As:** `ui5RatingIndicator`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-rating-indicator [value]="..." (ui5Change)="onChange($event)"></ui5-rating-indicator>
```

## Description
The Rating Indicator is used to display a specific number of icons that are used to rate an item. Additionally, it is also used to display the average and overall ratings. The recommended number of icons is between 5 and 7. You can change the size of the Rating Indicator by changing its font-size CSS property. Example: <ui5-rating-indicator style="font-size: 3rem;"></ui5-rating-indicator> When the ui5-rating-indicator is focused, the user can change the rating with the following keyboard shortcuts: - [RIGHT/UP] - Increases the value of the rating by one step. If the highest value is reached, d

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | `0` | The indicated value of the rating. **Note:** If you set a number which is not round, it would be shown as follows: - 1.0 |
| `max` | `number` | `5` | The number of displayed rating symbols. |
| `size` | `RatingIndicatorSize` | `"M"` | Defines the size of the component. |
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. **Note:** A disabled component is completely noninteractive. |
| `readonly` | `boolean` | `false` | Defines whether the component is read-only. **Note:** A read-only component is not editable, but still provides visual f |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component. |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | The event is fired when the value changes. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
