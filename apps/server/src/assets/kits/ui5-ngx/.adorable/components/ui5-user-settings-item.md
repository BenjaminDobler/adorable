# UserSettingsItem

**Type:** Component
**Selector:** `<ui5-user-settings-item>`
**Import:** `import { UserSettingsItemComponent } from '@ui5/webcomponents-ngx/fiori/user-settings-item';`
**Export As:** `ui5UserSettingsItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-user-settings-item [text]="..." (ui5SelectionChange)="onSelectionChange($event)"></ui5-user-settings-item>
```

## Description
The ui5-user-settings-item represents an item in the ui5-user-settings-dialog. import "@ui5/webcomponents-fiori/dist/UserSettingsItem.js"; You can disable the <code>UserSettingsItem</code> by setting the <code>enabled</code> property to <code>false</code>, or use the <code>UserSettingsItem</code> in read-only mode by setting the <code>editable</code> property to false. <b>Note:</b> Disabled and read-only states shouldn't be used together.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | `""` | Defines the text of the user settings item. |
| `tooltip` | `string` | `""` | Defines the tooltip of the component. A tooltip attribute should be provided to represent the meaning or function when t |
| `headerText` | `string | undefined` | `""` | Defines the headerText of the item. |
| `selected` | `boolean` | `false` | Shows item tab. |
| `disabled` | `boolean` | `false` | Defines whether the component is in disabled state. **Note:** A disabled component is completely noninteractive. |
| `loading` | `boolean` | `false` | Indicates whether a loading indicator should be shown. |
| `loadingReason` | `string | undefined` | `undefined` | Indicates why the control is in loading state. |
| `icon` | `string` | `"globe"` | Defines the icon of the component. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when a selected view changed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the page views of the user settings item. If there are no tab views, the first page view will be shown unless there is selected one. If there  |
| `tabs` | Defines the tab views of the user settings item. |
