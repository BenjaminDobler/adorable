# List

**Type:** Component
**Selector:** `<ui5-list>`
**Import:** `import { ListComponent } from '@ui5/webcomponents-ngx/main/list';`
**Export As:** `ui5List`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-list [headerText]="..." (ui5ItemClick)="onItemClick($event)"></ui5-list>
```

## Description
The ui5-list component allows displaying a list of items, advanced keyboard handling support for navigating between items, and predefined modes to improve the development efficiency. The ui5-list is a container for the available list items: - ui5-li - ui5-li-custom - ui5-li-group To benefit from the built-in selection mechanism, you can use the available selection modes, such as Single, Multiple and Delete. Additionally, the ui5-list provides header, footer, and customization for the list item separators. The ui5-list provides advanced keyboard handling. When a list is focused the user can use

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `headerText` | `string | undefined` | `undefined` | Defines the component header text. **Note:** If header is set this property is ignored. |
| `footerText` | `string | undefined` | `undefined` | Defines the footer text. |
| `indent` | `boolean` | `false` | Determines whether the component is indented. |
| `selectionMode` | `ListSelectionMode` | `"None"` | Defines the selection mode of the component. |
| `noDataText` | `string | undefined` | `undefined` | Defines the text that is displayed when the component contains no items. |
| `separators` | `ListSeparator` | `"All"` | Defines the item separator style that is used. |
| `growing` | `ListGrowingMode` | `"None"` | Defines whether the component will have growing capability either by pressing a More button, or via user scroll. In both |
| `growingButtonText` | `string | undefined` | `undefined` | Defines the text that will be displayed inside the growing button. **Note:** If not specified a built-in text will be di |
| `loading` | `boolean` | `false` | Defines if the component would display a loading indicator over the list. |
| `loadingDelay` | `number` | `1000` | Defines the delay in milliseconds, after which the loading indicator will show up for this component. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible name of the component. |
| `accessibilityAttributes` | `ListAccessibilityAttributes` | `{}` | Defines additional accessibility attributes on different areas of the component. The accessibilityAttributes object has  |
| `accessibleNameRef` | `string | undefined` | `undefined` | Defines the IDs of the elements that label the component. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Defines the IDs of the elements that describe the component. |
| `accessibleRole` | `ListAccessibleRole` | `"List"` | Defines the accessible role of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5ItemClick)` | ~~`(item-click)`~~ | Fired when an item is activated, unless the item's type property is set to Inactive. **Note**: This event is not trigger |
| `(ui5ItemClose)` | ~~`(item-close)`~~ | Fired when the Close button of any item is clicked **Note:** This event is only applicable to list items that can be clo |
| `(ui5ItemToggle)` | ~~`(item-toggle)`~~ | Fired when the Toggle button of any item is clicked. **Note:** This event is only applicable to list items that can be t |
| `(ui5ItemDelete)` | ~~`(item-delete)`~~ | Fired when the Delete button of any item is pressed. **Note:** A Delete button is displayed on each item, when the compo |
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when selection is changed by user interaction in Single, SingleStart, SingleEnd and Multiple selection modes. |
| `(ui5LoadMore)` | ~~`(load-more)`~~ | Fired when the user scrolls to the bottom of the list. **Note:** The event is fired when the growing='Scroll' property i |
| `(ui5MoveOver)` | ~~`(move-over)`~~ | Fired when a movable list item is moved over a potential drop target during a dragging operation. If the new position is |
| `(ui5Move)` | ~~`(move)`~~ | Fired when a movable list item is dropped onto a drop target. **Note:** move event is fired only if there was a precedin |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of the component. **Note:** Use ui5-li, ui5-li-custom, and ui5-li-group for the intended design. |
| `header` | Defines the component header. **Note:** When header is set, the headerText property is ignored. |

## CSS Parts
| Name | Description |
|------|-------------|
| `growing-button` | Used to style the button, that is used for growing of the component |
| `growing-button-inner` | Used to style the button inner element |

## Related Horizon Theme Variables
- `--sapList_HeaderBackground` = #fff
- `--sapList_HeaderBorderColor` = #a8b2bd
- `--sapList_HeaderTextColor` = #131e29
- `--sapList_BorderColor` = #e5e5e5
- `--sapList_BorderWidth` = .0625rem
- `--sapList_TextColor` = #131e29
- `--sapList_Active_TextColor` = #131e29
- `--sapList_Active_Background` = #dee2e5
- `--sapList_SelectionBackgroundColor` = #ebf8ff
- `--sapList_SelectionBorderColor` = #0064d9
- `--sapList_Hover_SelectionBackground` = #dcf3ff
- `--sapList_Background` = #fff
- `--sapList_Hover_Background` = #eaecee
- `--sapList_AlternatingBackground` = #f5f6f7
- `--sapList_GroupHeaderBackground` = #fff
- ...and 11 more
