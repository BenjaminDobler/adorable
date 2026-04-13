# UserSettingsAccountView

**Type:** Component
**Selector:** `<ui5-user-settings-account-view>`
**Import:** `import { UserSettingsAccountViewComponent } from '@ui5/webcomponents-ngx/fiori/user-settings-account-view';`
**Export As:** `ui5UserSettingsAccountView`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-user-settings-account-view [text]="..." (ui5EditAccountsClick)="onEditAccountsClick($event)"></ui5-user-settings-account-view>
```

## Description
The ui5-user-settings-account-view represents a view displayed in the ui5-user-settings-item.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the title text of the user settings view. |
| `selected` | `boolean` | `false` | Defines whether the view is selected. There can be just one selected view at a time. |
| `secondary` | `boolean` | `false` | Indicates whether the view is secondary. It is relevant only if the view is used in pages slot of ui5-user-settings-item |
| `showManageAccount` | `boolean` | `false` | Defines if the User Menu shows the Manage Account option. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5EditAccountsClick)` | ~~`(edit-accounts-click)`~~ | Fired when the Edit Accounts button is selected. |
| `(ui5ManageAccountClick)` | ~~`(manage-account-click)`~~ | Fired when the Manage Account button is selected. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `account` | Defines the user account. |
| `default` | Defines the content of the view. |
