# MenuItem

**Type:** Component
**Selector:** `<ui5-menu-item>`
**Import:** `import { MenuItemComponent } from '@ui5/webcomponents-ngx/main/menu-item';`
**Export As:** `ui5MenuItem`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-menu-item [type]="..." (ui5DetailClick)="onDetailClick($event)"></ui5-menu-item>
```

## Description
ui5-menu-item is the item to use inside a ui5-menu. An arbitrary hierarchy structure can be represented by recursively nesting menu items. ui5-menu-item represents a node in a ui5-menu. The menu itself is rendered as a list, and each ui5-menu-item is represented by a list item in that list. Therefore, you should only use ui5-menu-item directly in your apps. The ui5-li list item is internal for the list, and not intended for public use. import "@ui5/webcomponents/dist/MenuItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `ListItemType` | `"Active"` | Defines the visual indication and behavior of the list items. Available options are Active (by default), Inactive, Detai |
| `accessibilityAttributes` | `MenuItemAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following fields are supporte |
| `navigated` | `boolean` | `false` | The navigated state of the list item. If set to true, a navigation indicator is displayed at the end of the list item. |
| `tooltip` | `string | undefined` | `undefined` | Defines the text of the tooltip for the menu item. |
| `highlight` | `Highlight` | `"None"` | Defines the highlight state of the list items. Available options are: "None" (by default), "Positive", "Critical", "Info |
| `selected` | `boolean` | `false` | Defines the selected state of the component. |
| `text` | `string | undefined` | `undefined` | Defines the text of the tree item. |
| `additionalText` | `string | undefined` | `undefined` | Defines the additionalText, displayed in the end of the menu item. **Note:** The additional text will not be displayed i |
| `icon` | `string | undefined` | `undefined` | Defines the icon to be displayed as graphical element within the component. The SAP-icons font provides numerous options |
| `disabled` | `boolean` | `false` | Defines whether menu item is in disabled state. **Note:** A disabled menu item is noninteractive. |
| `loading` | `boolean` | `false` | Defines the delay in milliseconds, after which the loading indicator will be displayed inside the corresponding menu pop |
| `loadingDelay` | `number` | `1000` | Defines the delay in milliseconds, after which the loading indicator will be displayed inside the corresponding menu pop |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `checked` | `boolean` | `false` | Defines whether menu item is in checked state. **Note:** checked state is only taken into account when menu item is adde |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5DetailClick)` | ~~`(detail-click)`~~ | Fired when the user clicks on the detail button when type is Detail. |
| `(ui5BeforeOpen)` | ~~`(before-open)`~~ | Fired before the menu is opened. This event can be cancelled, which will prevent the menu from opening. **Note:** Since  |
| `(ui5Open)` | ~~`(open)`~~ | Fired after the menu is opened. |
| `(ui5BeforeClose)` | ~~`(before-close)`~~ | Fired before the menu is closed. This event can be cancelled, which will prevent the menu from closing. |
| `(ui5Close)` | ~~`(close)`~~ | Fired after the menu is closed. |
| `(ui5Check)` | ~~`(check)`~~ | Fired when an item is checked or unchecked. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of this component. **Note:** The slot can hold menu item and menu separator items. If there are items added to this slot, an arrow w |
| `deleteButton` | Defines the delete button, displayed in "Delete" mode. **Note:** While the slot allows custom buttons, to match design guidelines, please use the ui5- |
| `endContent` | Defines the components that should be displayed at the end of the menu item. **Note:** It is highly recommended to slot only components of type ui5-bu |
