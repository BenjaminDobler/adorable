# ListItemStandard

**Type:** Component
**Selector:** `<ui5-li>`
**Import:** `import { ListItemStandardComponent } from '@ui5/webcomponents-ngx/main/list-item-standard';`
**Export As:** `ui5Li`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-li [type]="..." (ui5DetailClick)="onDetailClick($event)"></ui5-li>
```

## Description
The ui5-li represents the simplest type of item for a ui5-list. This is a list item, providing the most common use cases such as text, image and icon.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `ListItemType` | `"Active"` | Defines the visual indication and behavior of the list items. Available options are Active (by default), Inactive, Detai |
| `accessibilityAttributes` | `ListItemAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following fields are supporte |
| `navigated` | `boolean` | `false` | The navigated state of the list item. If set to true, a navigation indicator is displayed at the end of the list item. |
| `tooltip` | `string | undefined` | `undefined` | Defines the text of the tooltip that would be displayed for the list item. |
| `highlight` | `Highlight` | `"None"` | Defines the highlight state of the list items. Available options are: "None" (by default), "Positive", "Critical", "Info |
| `selected` | `boolean` | `false` | Defines the selected state of the component. |
| `text` | `string | undefined` | `undefined` | Defines the text of the component. |
| `description` | `string | undefined` | `undefined` | Defines the description displayed right under the item text, if such is present. |
| `icon` | `string | undefined` | `undefined` | Defines the icon source URI. **Note:** SAP-icons font provides numerous built-in icons. To find all the available icons, |
| `iconEnd` | `boolean` | `false` | Defines whether the icon should be displayed in the beginning of the list item or in the end. |
| `additionalText` | `string | undefined` | `undefined` | Defines the additionalText, displayed in the end of the list item. |
| `additionalTextState` | `ValueState` | `"None"` | Defines the state of the additionalText. Available options are: "None" (by default), "Positive", "Critical", "Informatio |
| `movable` | `boolean` | `false` | Defines whether the item is movable. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the text alternative of the component. Note: If not provided a default text alternative will be set, if present. |
| `wrappingType` | `WrappingType` | `"None"` | Defines if the text of the component should wrap when it's too long. When set to "Normal", the content (title, descripti |

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
| `default` | Defines the custom formatted text of the component. **Note:** For optimal text wrapping and a consistent layout, it is strongly recommended to use the |
| `deleteButton` | Defines the delete button, displayed in "Delete" mode. **Note:** While the slot allows custom buttons, to match design guidelines, please use the ui5- |
| `image` | **Note:** While the slot allows option for setting custom avatar, to match the design guidelines, please use the ui5-avatar with it's default size - S |

## CSS Parts
| Name | Description |
|------|-------------|
| `additional-text` | Used to style the additionalText of the list item |
| `checkbox` | Used to style the checkbox rendered when the list item is in multiple selection mode |
| `content` | Used to style the content area of the list item |
| `delete-button` | Used to style the button rendered when the list item is in delete mode |
| `description` | Used to style the description of the list item |
| `detail-button` | Used to style the button rendered when the list item is of type detail |
| `icon` | Used to style the icon of the list item |
| `native-li` | Used to style the main li tag of the list item |
| `radio` | Used to style the radio button rendered when the list item is in single selection mode |
| `title` | Used to style the title of the list item |
