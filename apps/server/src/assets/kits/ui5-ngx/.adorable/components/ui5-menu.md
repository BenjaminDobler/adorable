# Menu

**Type:** Component
**Selector:** `<ui5-menu>`
**Import:** `import { MenuComponent } from '@ui5/webcomponents-ngx/main/menu';`
**Export As:** `ui5Menu`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-menu [headerText]="..." (ui5ItemClick)="onItemClick($event)"></ui5-menu>
```

## Description
ui5-menu component represents a hierarchical menu structure. The ui5-menu can hold two types of entities: - ui5-menu-item components - ui5-menu-separator - used to separate menu items with a line An arbitrary hierarchy structure can be represented by recursively nesting menu items. The ui5-menu provides advanced keyboard handling. The user can use the following keyboard shortcuts in order to navigate trough the tree: - Arrow Up / Arrow Down - Navigates up and down the menu items that are currently visible. - Arrow Right, Space or Enter - Opens a sub-menu if there are menu items nested in the c

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `headerText` | `string | undefined` | `undefined` | Defines the header text of the menu (displayed on mobile). |
| `open` | `boolean` | `false` | Indicates if the menu is open. |
| `placement` | `PopoverPlacement` | `"Bottom"` | Determines on which side the component is placed at. |
| `horizontalAlign` | `PopoverHorizontalAlign` | `"Start"` | Determines the horizontal alignment of the menu relative to its opener control. |
| `loading` | `boolean` | `false` | Defines if a loading indicator would be displayed inside the corresponding ui5-menu popover. |
| `loadingDelay` | `number` | `1000` | Defines the delay in milliseconds, after which the loading indicator will be displayed inside the corresponding ui5-menu |
| `opener` | `HTMLElement | string | null | undefined` | `undefined` | Defines the ID or DOM Reference of the element at which the menu is shown. When using this attribute in a declarative wa |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5ItemClick)` | ~~`(item-click)`~~ | Fired when an item is being clicked. **Note:** Since 1.17.0 the event is preventable, allowing the menu to remain open a |
| `(ui5BeforeOpen)` | ~~`(before-open)`~~ | Fired before the menu is opened. This event can be cancelled, which will prevent the menu from opening. **Note:** Since  |
| `(ui5Open)` | ~~`(open)`~~ | Fired after the menu is opened. |
| `(ui5BeforeClose)` | ~~`(before-close)`~~ | Fired before the menu is closed. This event can be cancelled, which will prevent the menu from closing. |
| `(ui5Close)` | ~~`(close)`~~ | Fired after the menu is closed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of this component. **Note:** Use ui5-menu-item and ui5-menu-separator for their intended design. |
