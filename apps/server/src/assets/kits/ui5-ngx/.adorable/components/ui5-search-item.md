# SearchItem

**Type:** Component
**Selector:** `<ui5-search-item>`
**Import:** `import { SearchItemComponent } from '@ui5/webcomponents-ngx/fiori/search-item';`
**Export As:** `ui5SearchItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-search-item [text]="..." (ui5Delete)="onDelete($event)"></ui5-search-item>
```

## Description
A ui5-search-item is a list item, used for displaying search suggestions import "@ui5/webcomponents-fiori/dist/SearchItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the heading text of the search item. |
| `description` | `string | undefined` | `undefined` | Defines the description that appears right under the item text, if available. |
| `icon` | `string | undefined` | `undefined` | Defines the icon name of the search item. **Note:** If provided, the image slot will be ignored. |
| `selected` | `boolean` | `false` | Defines whether the search item is selected. |
| `deletable` | `boolean` | `false` | Defines whether the search item is deletable. |
| `scopeName` | `string | undefined` | `undefined` | Defines the scope of the search item |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Delete)` | ~~`(delete)`~~ | Fired when delete button is pressed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `actions` | Defines the actionable elements. This slot allows placing additional interactive elements (such as buttons, icons, or tags) next to the delete button, |
| `image` | **Note:** While the slot allows the option of setting a custom avatar, to comply with the design guidelines, use the ui5-avatar with size - XS. |
