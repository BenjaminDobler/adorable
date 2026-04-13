# ListItemCustom

**Type:** Component
**Selector:** `<ui5-li-custom>`
**Import:** `import { ListItemCustomComponent } from '@ui5/webcomponents-ngx/main/list-item-custom';`
**Export As:** `ui5LiCustom`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-li-custom [type]="..." (ui5DetailClick)="onDetailClick($event)"></ui5-li-custom>
```

## Description
A component to be used as custom list item within the ui5-list the same way as the standard ui5-li. The component accepts arbitrary HTML content to allow full customization.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `ListItemType` | `"Active"` | Defines the visual indication and behavior of the list items. Available options are Active (by default), Inactive, Detai |
| `accessibilityAttributes` | `ListItemAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following fields are supporte |
| `navigated` | `boolean` | `false` | The navigated state of the list item. If set to true, a navigation indicator is displayed at the end of the list item. |
| `tooltip` | `string | undefined` | `undefined` | Defines the text of the tooltip that would be displayed for the list item. |
| `highlight` | `Highlight` | `"None"` | Defines the highlight state of the list items. Available options are: "None" (by default), "Positive", "Critical", "Info |
| `selected` | `boolean` | `false` | Defines the selected state of the component. |
| `movable` | `boolean` | `false` | Defines whether the item is movable. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the text alternative of the component. **Note**: If not provided a default text alternative will be set, if pres |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5DetailClick)` | ~~`(detail-click)`~~ | Fired when the user clicks on the detail button when type is Detail. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the component. |
| `deleteButton` | Defines the delete button, displayed in "Delete" mode. **Note:** While the slot allows custom buttons, to match design guidelines, please use the ui5- |

## CSS Parts
| Name | Description |
|------|-------------|
| `checkbox` | Used to style the checkbox rendered when the list item is in multiple selection mode |
| `content` | Used to style the content area of the list item |
| `delete-button` | Used to style the button rendered when the list item is in delete mode |
| `detail-button` | Used to style the button rendered when the list item is of type detail |
| `native-li` | Used to style the main li tag of the list item |
| `radio` | Used to style the radio button rendered when the list item is in single selection mode |
