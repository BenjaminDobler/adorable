# SearchItemShowMore

**Type:** Component
**Selector:** `<ui5-search-item-show-more>`
**Import:** `import { SearchItemShowMoreComponent } from '@ui5/webcomponents-ngx/fiori/search-item-show-more';`
**Export As:** `ui5SearchItemShowMore`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-search-item-show-more [itemsToShowCount]="..." (ui5Click)="onClick($event)"></ui5-search-item-show-more>
```

## Description
A ui5-search-item-show-more is a special type of ui5-li that acts as a button to progressively reveal additional (overflow) items within a group. import "@ui5/webcomponents-fiori/dist/SearchItemShowMore.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `itemsToShowCount` | `number | undefined` | `undefined` | Specifies the number of additional items available to show. If no value is defined, the control shows "Show more" (witho |
| `selected` | `boolean` | `false` | Defines whether the show more item is selected. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the component is activated, either with a mouse/tap or by pressing the Enter or Space keys. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
