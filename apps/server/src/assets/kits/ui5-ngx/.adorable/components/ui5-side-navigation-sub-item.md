# SideNavigationSubItem

**Type:** Component
**Selector:** `<ui5-side-navigation-sub-item>`
**Import:** `import { SideNavigationSubItemComponent } from '@ui5/webcomponents-ngx/fiori/side-navigation-sub-item';`
**Export As:** `ui5SideNavigationSubItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-side-navigation-sub-item [text]="..." (ui5Click)="onClick($event)"></ui5-side-navigation-sub-item>
```

## Description
Represents a single navigation action within ui5-side-navigation-item. The ui5-side-navigation-sub-item is intended to be used inside a ui5-side-navigation-item only. import "@ui5/webcomponents-fiori/dist/SideNavigationSubItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the item. |
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. A disabled component can't be pressed or focused, and it is not in the tab ch |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the component. A tooltip attribute should be provided, in order to represent meaning/function, wh |
| `icon` | `string | undefined` | `undefined` | Defines the icon of the item. **Note:** Icons on second-level (child) navigation items are not recommended according to  |
| `selected` | `boolean` | `false` | Defines whether the item is selected. **Note:** Items that have a set href and target set to _blank should not be select |
| `href` | `string | undefined` | `undefined` | Defines the link target URI. Supports standard hyperlink behavior. If a JavaScript action should be triggered, this shou |
| `target` | `string | undefined` | `undefined` | Defines the component target. Possible values: - _self - _top - _blank - _parent - framename **Note:** Items that have a |
| `design` | `SideNavigationItemDesign` | `"Default"` | Item design. **Note:** Items with "Action" design must not have sub-items. |
| `unselectable` | `boolean` | `false` | Indicates whether the navigation item is selectable. By default, all items are selectable unless specifically marked as  |
| `accessibilityAttributes` | `SideNavigationItemAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following fields are supporte |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the component is activated either with a click/tap or by using the [Enter] or [Space] keys. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
