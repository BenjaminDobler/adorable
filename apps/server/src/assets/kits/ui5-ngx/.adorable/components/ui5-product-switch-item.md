# ProductSwitchItem

**Type:** Component
**Selector:** `<ui5-product-switch-item>`
**Import:** `import { ProductSwitchItemComponent } from '@ui5/webcomponents-ngx/fiori/product-switch-item';`
**Export As:** `ui5ProductSwitchItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-product-switch-item [titleText]="..." (ui5Click)="onClick($event)"></ui5-product-switch-item>
```

## Description
The ui5-product-switch-item web component represents the items displayed in the ui5-product-switch web component. **Note:** ui5-product-switch-item is not supported when used outside of ui5-product-switch. The ui5-product-switch provides advanced keyboard handling. When focused, the user can use the following keyboard shortcuts in order to perform a navigation: - [Space] / [Enter] or [Return] - Trigger ui5-click event import "@ui5/webcomponents-fiori/dist/ProductSwitchItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `titleText` | `string | undefined` | `undefined` | Defines the title of the component. |
| `subtitleText` | `string | undefined` | `undefined` | Defines the subtitle of the component. |
| `icon` | `string | undefined` | `undefined` | Defines the icon to be displayed as a graphical element within the component. Example: <ui5-product-switch-item icon="pa |
| `target` | `string | undefined` | `undefined` | Defines a target where the targetSrc content must be open. Available options are: - _self - _top - _blank - _parent - _s |
| `targetSrc` | `string | undefined` | `undefined` | Defines the component target URI. Supports standard hyperlink behavior. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the ui5-product-switch-item is activated either with a click/tap or by using the Enter or Space key. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `image` | Defines an image to be displayed instead of the standard icon. **Note:** The image slot takes precedence over the icon property. **Note:** We recommen |
