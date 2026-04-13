# ShellBar

**Type:** Component
**Selector:** `<ui5-shellbar>`
**Import:** `import { ShellBarComponent } from '@ui5/webcomponents-ngx/fiori/shell-bar';`
**Export As:** `ui5Shellbar`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-shellbar [hideSearchButton]="..." (ui5NotificationsClick)="onNotificationsClick($event)"></ui5-shellbar>
```

## Description
The ui5-shellbar is meant to serve as an application header and includes numerous built-in features, such as: logo, profile image/icon, title, search field, notifications and so on. You can use the following stable DOM refs for the ui5-shellbar: - logo - notifications - overflow - profile - product-switch This component provides a build in fast navigation group which can be used via [F6] / [Shift] + [F6] / [Ctrl] + [Alt/Option] / [Down] or [Ctrl] + [Alt/Option] + [Up]. In order to use this functionality, you need to import the following module: import "@ui5/webcomponents-base/dist/features/F6N

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `hideSearchButton` | `boolean` | `false` | Defines the visibility state of the search button. **Note:** The hideSearchButton property is in an experimental state a |
| `disableSearchCollapse` | `boolean` | `false` | Disables the automatic search field expansion/collapse when the available space is not enough. **Note:** The disableSear |
| `primaryTitle` | `string | undefined` | `undefined` | Defines the primaryTitle. **Note:** The primaryTitle would be hidden on S screen size (less than approx. 700px). |
| `secondaryTitle` | `string | undefined` | `undefined` | Defines the secondaryTitle. **Note:** The secondaryTitle would be hidden on S and M screen sizes (less than approx. 1300 |
| `notificationsCount` | `string | undefined` | `undefined` | Defines the notificationsCount, displayed in the notification icon top-right corner. |
| `showNotifications` | `boolean` | `false` | Defines, if the notification icon would be displayed. |
| `showProductSwitch` | `boolean` | `false` | Defines, if the product switch icon would be displayed. |
| `showSearchField` | `boolean` | `false` | Defines, if the Search Field would be displayed when there is a valid searchField slot. **Note:** By default the Search  |
| `accessibilityAttributes` | `ShellBarAccessibilityAttributes` | `{}` | Defines additional accessibility attributes on different areas of the component. The accessibilityAttributes object has  |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5NotificationsClick)` | ~~`(notifications-click)`~~ | Fired, when the notification icon is activated. |
| `(ui5ProfileClick)` | ~~`(profile-click)`~~ | Fired, when the profile slot is present. |
| `(ui5ProductSwitchClick)` | ~~`(product-switch-click)`~~ | Fired, when the product switch icon is activated. **Note:** You can prevent closing of overflow popover by calling event |
| `(ui5LogoClick)` | ~~`(logo-click)`~~ | Fired, when the logo is activated. |
| `(ui5MenuItemClick)` | ~~`(menu-item-click)`~~ | Fired, when a menu item is activated **Note:** You can prevent closing of overflow popover by calling event.preventDefau |
| `(ui5SearchButtonClick)` | ~~`(search-button-click)`~~ | Fired, when the search button is activated. **Note:** You can prevent expanding/collapsing of the search field by callin |
| `(ui5SearchFieldToggle)` | ~~`(search-field-toggle)`~~ | Fired, when the search field is expanded or collapsed. |
| `(ui5SearchFieldClear)` | ~~`(search-field-clear)`~~ | Fired, when the search cancel button is activated. **Note:** You can prevent the default behavior (clearing the search f |
| `(ui5ContentItemVisibilityChange)` | ~~`(content-item-visibility-change)`~~ | Fired, when an item from the content slot is hidden or shown. **Note:** The content-item-visibility-change event is in a |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `assistant` | Defines the assistant slot. |
| `branding` | Defines the branding slot. The ui5-shellbar-branding component is intended to be placed inside this slot. Content placed here takes precedence over th |
| `content` | Define the items displayed in the content area. Use the data-hide-order attribute with numeric value to specify the order of the items to be hidden wh |
| `default` | Defines the ui5-shellbar additional items. **Note:** You can use the <ui5-shellbar-item></ui5-shellbar-item>. |
| `logo` | Defines the logo of the ui5-shellbar. For example, you can use ui5-avatar or img elements as logo. |
| `menuItems` | Defines the items displayed in menu after a click on a start button. **Note:** You can use the <ui5-li></ui5-li> and its ancestors. |
| `profile` | You can pass ui5-avatar to set the profile image/icon. If no profile slot is set - profile will be excluded from actions. **Note:** We recommend not u |
| `searchField` | Defines the ui5-input, that will be used as a search field. |
| `startButton` | Defines a ui5-button in the bar that will be placed in the beginning. We encourage this slot to be used for a menu button. It gets overstyled to match |

## CSS Parts
| Name | Description |
|------|-------------|
| `root` | Used to style the outermost wrapper of the ui5-shellbar |
