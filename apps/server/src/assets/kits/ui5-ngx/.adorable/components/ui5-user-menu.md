# UserMenu

**Type:** Component
**Selector:** `<ui5-user-menu>`
**Import:** `import { UserMenuComponent } from '@ui5/webcomponents-ngx/fiori/user-menu';`
**Export As:** `ui5UserMenu`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-user-menu [open]="..." (ui5AvatarClick)="onAvatarClick($event)"></ui5-user-menu>
```

## Description
The ui5-user-menu is an SAP Fiori specific web component that is used in ui5-shellbar and allows the user to easily see information and settings for the current user and all other logged in accounts. import "@ui5/webcomponents-fiori/dist/UserMenu.js"; import "@ui5/webcomponents-fiori/dist/UserMenuItem.js"; (for ui5-user-menu-item)

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | `false` | Defines if the User Menu is opened. |
| `opener` | `HTMLElement | string | null | undefined` | `undefined` | Defines the ID or DOM Reference of the element at which the user menu is shown. When using this attribute in a declarati |
| `showManageAccount` | `boolean` | `false` | Defines if the User Menu shows the Manage Account option. |
| `showOtherAccounts` | `boolean` | `false` | Defines if the User Menu shows the Other Accounts option. |
| `showEditAccounts` | `boolean` | `false` | Defines if the User Menu shows the Edit Accounts option. |
| `showEditButton` | `boolean` | `false` | Defines if the User menu shows edit button. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5AvatarClick)` | ~~`(avatar-click)`~~ | Fired when the account avatar is selected. |
| `(ui5ManageAccountClick)` | ~~`(manage-account-click)`~~ | Fired when the "Manage Account" button is selected. |
| `(ui5EditAccountsClick)` | ~~`(edit-accounts-click)`~~ | Fired when the "Edit Accounts" button is selected. |
| `(ui5ChangeAccount)` | ~~`(change-account)`~~ | Fired when the account is switched to a different one. |
| `(ui5ItemClick)` | ~~`(item-click)`~~ | Fired when a menu item is selected. |
| `(ui5Open)` | ~~`(open)`~~ | Fired when a user menu is open. |
| `(ui5Close)` | ~~`(close)`~~ | Fired when a user menu is close. |
| `(ui5SignOutClick)` | ~~`(sign-out-click)`~~ | Fired when the "Sign Out" button is selected. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `accounts` | Defines the user accounts. **Note:** If one item is used, it will be shown as the selected one. If more than one item is used, the first one will be s |
| `default` | Defines the menu items. |
| `footer` | Defines custom footer content. **Note:** When provided, replaces the default "Sign Out" button. Use an empty element to hide the footer completely. |
