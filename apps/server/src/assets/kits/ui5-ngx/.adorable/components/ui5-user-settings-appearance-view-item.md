# UserSettingsAppearanceViewItem

**Type:** Component
**Selector:** `<ui5-user-settings-appearance-view-item>`
**Import:** `import { UserSettingsAppearanceViewItemComponent } from '@ui5/webcomponents-ngx/fiori/user-settings-appearance-view-item';`
**Export As:** `ui5UserSettingsAppearanceViewItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-user-settings-appearance-view-item [type]="..." (ui5DetailClick)="onDetailClick($event)"></ui5-user-settings-appearance-view-item>
```

## Description
The ui5-user-settings-appearance-view-item represents a theme/appearance option item within the ui5-user-settings-appearance-view. It displays a theme with an avatar icon, text label, and can be selected. import "@ui5/webcomponents-fiori/dist/UserSettingsAppearanceViewItem.js";

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
| `itemKey` | `string` | `""` | Defines the unique identifier of the item. |
| `text` | `string` | `""` | Defines the text label displayed for the appearance item. |
| `icon` | `string` | `"product"` | Defines the icon of the appearance item. |
| `colorScheme` | `string` | `"Accent7"` | Defines the color scheme of the avatar. |

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
