# NotificationList

**Type:** Component
**Selector:** `<ui5-notification-list>`
**Import:** `import { NotificationListComponent } from '@ui5/webcomponents-ngx/fiori/notification-list';`
**Export As:** `ui5NotificationList`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-notification-list [noDataText]="..." (ui5ItemClick)="onItemClick($event)"></ui5-notification-list>
```

## Description
The ui5-notification-list web component represents a container for ui5-li-notification-group and ui5-li-notification. The ui5-notification-list provides advanced keyboard handling. When a list is focused the user can use the following keyboard shortcuts in order to perform a navigation: - [Up] or [Left] - Navigates up the items - [Down] or [Right] - Navigates down the items - [Home] - Navigates to first item - [End] - Navigates to the last item This component provides a build in fast navigation group which can be used via [F6] / [Shift] + [F6] / [Ctrl] + [Alt/Option] / [Down] or [Ctrl] + [Alt/

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `noDataText` | `string | undefined` | `undefined` | Defines the text that is displayed when the component contains no items. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5ItemClick)` | ~~`(item-click)`~~ | Fired when an item is clicked. |
| `(ui5ItemClose)` | ~~`(item-close)`~~ | Fired when the Close button of any item is clicked. |
| `(ui5ItemToggle)` | ~~`(item-toggle)`~~ | Fired when an item is toggled. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of the component. |
