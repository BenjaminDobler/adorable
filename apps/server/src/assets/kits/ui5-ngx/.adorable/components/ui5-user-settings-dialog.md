# UserSettingsDialog

**Type:** Component
**Selector:** `<ui5-user-settings-dialog>`
**Import:** `import { UserSettingsDialogComponent } from '@ui5/webcomponents-ngx/fiori/user-settings-dialog';`
**Export As:** `ui5UserSettingsDialog`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-user-settings-dialog [open]="..." (ui5SelectionChange)="onSelectionChange($event)"></ui5-user-settings-dialog>
```

## Description
The ui5-user-settings-dialog is an SAP Fiori-specific web component used in the ui5-user-menu. It allows the user to easily view information and settings for an account. import "@ui5/webcomponents-fiori/dist/UserSettingsDialog.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | `false` | Defines, if the User Settings Dialog is opened. |
| `headerText` | `string | undefined` | `undefined` | Defines the headerText of the item. |
| `showSearchField` | `boolean` | `false` | Defines if the Search Field would be displayed. **Note:** By default the Search Field is not displayed. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when an item is selected. |
| `(ui5Open)` | ~~`(open)`~~ | Fired when a settings dialog is open. |
| `(ui5BeforeClose)` | ~~`(before-close)`~~ | Fired before the settings dialog is closed. |
| `(ui5Close)` | ~~`(close)`~~ | Fired when a settings dialog is closed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the user settings items. **Note:** If no setting item is set as selected, the first one will be selected. |
| `fixedItems` | Defines the fixed user settings items. |
