# NotificationListGroupItem

**Type:** Component
**Selector:** `<ui5-li-notification-group>`
**Import:** `import { NotificationListGroupItemComponent } from '@ui5/webcomponents-ngx/fiori/notification-list-group-item';`
**Export As:** `ui5LiNotificationGroup`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-li-notification-group [titleText]="..." (ui5Toggle)="onToggle($event)"></ui5-li-notification-group>
```

## Description
The ui5-li-notification-group is a special type of list item, that unlike others can group items within self, usually ui5-li-notification items. The component consists of: - Toggle button to expand and collapse the group - TitleText to entitle the group - Items of the group The component should be used inside a ui5-notification-list. The ui5-li-notification-group provides advanced keyboard handling. This component provides fast navigation when the header is focused using the following keyboard shortcuts: - [Space] - toggles expand / collapse of the group - [Plus] - expands the group - [Minus] 

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `titleText` | `string | undefined` | `undefined` | Defines the titleText of the item. |
| `read` | `boolean` | `false` | Defines if the notification is new or has been already read. **Note:** if set to false the titleText has bold font, if s |
| `loading` | `boolean` | `false` | Defines if a busy indicator would be displayed over the item. |
| `loadingDelay` | `number` | `1000` | Defines the delay in milliseconds, after which the busy indicator will show up for this component. |
| `collapsed` | `boolean` | `false` | Defines if the group is collapsed or expanded. |
| `growing` | `NotificationListGrowingMode` | `"None"` | Defines whether the component will have growing capability by pressing a More button. When button is pressed load-more e |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Toggle)` | ~~`(toggle)`~~ | Fired when the ui5-li-notification-group is expanded/collapsed by user interaction. |
| `(ui5LoadMore)` | ~~`(load-more)`~~ | Fired when additional items are requested. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of the ui5-li-notification-group, usually ui5-li-notification items. |
