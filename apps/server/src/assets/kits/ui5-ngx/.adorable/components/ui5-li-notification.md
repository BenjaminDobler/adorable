# NotificationListItem

**Type:** Component
**Selector:** `<ui5-li-notification>`
**Import:** `import { NotificationListItemComponent } from '@ui5/webcomponents-ngx/fiori/notification-list-item';`
**Export As:** `ui5LiNotification`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-li-notification [titleText]="..." (ui5Close)="onClose($event)"></ui5-li-notification>
```

## Description
The ui5-li-notification is a type of list item, meant to display notifications. The component has a rich set of various properties that allows the user to set avatar, menu, titleText, descriptive content and footnotes to fully describe a notification. The user can: - display a Close button - can control whether the titleText and description should wrap or truncate and display a ShowMore button to switch between less and more information - add actions by using the ui5-menu component **Note:** Adding custom actions by using the ui5-notification-action component is deprecated as of version 2.0! T

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `titleText` | `string | undefined` | `undefined` | Defines the titleText of the item. |
| `read` | `boolean` | `false` | Defines if the notification is new or has been already read. **Note:** if set to false the titleText has bold font, if s |
| `loading` | `boolean` | `false` | Defines if a busy indicator would be displayed over the item. |
| `loadingDelay` | `number` | `1000` | Defines the delay in milliseconds, after which the busy indicator will show up for this component. |
| `wrappingType` | `WrappingType` | `"None"` | Defines if the titleText and description should wrap, they truncate by default. **Note:** by default the titleText and d |
| `state` | `ValueState` | `"None"` | Defines the status indicator of the item. |
| `showClose` | `boolean` | `false` | Defines if the Close button would be displayed. |
| `importance` | `NotificationListItemImportance` | `"Standard"` | Defines the Important label of the item. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Close)` | ~~`(close)`~~ | Fired when the Close button is pressed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `avatar` | Defines the avatar, displayed in the ui5-li-notification. **Note:** Consider using the ui5-avatar to display icons, initials or images. **Note:** In o |
| `default` | Defines the content of the ui5-li-notification, usually a description of the notification. **Note:** Although this slot accepts HTML Elements, it is s |
| `footnotes` | Defines the elements, displayed in the footer of the of the component. |
| `menu` | Defines the menu, displayed in the ui5-li-notification. **Note:** Use this for implementing actions. **Note:** Should be used instead u5-notification- |

## CSS Parts
| Name | Description |
|------|-------------|
| `title-text` | Used to style the titleText of the notification list item |
