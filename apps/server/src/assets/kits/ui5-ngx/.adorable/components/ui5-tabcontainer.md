# TabContainer

**Type:** Component
**Selector:** `<ui5-tabcontainer>`
**Import:** `import { TabContainerComponent } from '@ui5/webcomponents-ngx/main/tab-container';`
**Export As:** `ui5Tabcontainer`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-tabcontainer [collapsed]="..." (ui5TabSelect)="onTabSelect($event)"></ui5-tabcontainer>
```

## Description
The ui5-tabcontainer represents a collection of tabs with associated content. Navigation through the tabs changes the content display of the currently active content area. A tab can be labeled with text only, or icons with text. The ui5-tabcontainer can hold two types of entities: - ui5-tab - contains all the information on an item (text and icon) - ui5-tab-separator - used to separate tabs with a line Multiple sub tabs could be placed underneath one main tab. Nesting allows deeper hierarchies with indentations to indicate the level of each nested tab. When a tab has both sub tabs and own cont

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `collapsed` | `boolean` | `false` | Defines whether the tab content is collapsed. |
| `tabLayout` | `TabLayout` | `"Standard"` | Defines the alignment of the content and the additionalText of a tab. **Note:** The content and the additionalText would |
| `overflowMode` | `OverflowMode` | `"End"` | Defines the overflow mode of the header (the tab strip). If you have a large number of tabs, only the tabs that can fit  |
| `headerBackgroundDesign` | `BackgroundDesign` | `"Solid"` | Sets the background color of the Tab Container's header as Solid, Transparent, or Translucent. |
| `contentBackgroundDesign` | `BackgroundDesign` | `"Solid"` | Sets the background color of the Tab Container's content as Solid, Transparent, or Translucent. |
| `noAutoSelection` | `boolean` | `false` | Defines if automatic tab selection is deactivated. **Note:** By default, if none of the child tabs have the selected pro |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5TabSelect)` | ~~`(tab-select)`~~ | Fired when a tab is selected. |
| `(ui5MoveOver)` | ~~`(move-over)`~~ | Fired when element is being moved over the tab container. If the new position is valid, prevent the default action of th |
| `(ui5Move)` | ~~`(move)`~~ | Fired when element is moved to the tab container. **Note:** move event is fired only if there was a preceding move-over  |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the tabs. **Note:** Use ui5-tab and ui5-tab-separator for the intended design. |
| `overflowButton` | Defines the button which will open the overflow menu. If nothing is provided to this slot, the default button will be used. |
| `startOverflowButton` | Defines the button which will open the start overflow menu if available. If nothing is provided to this slot, the default button will be used. |

## CSS Parts
| Name | Description |
|------|-------------|
| `content` | Used to style the content of the component |
| `tabstrip` | Used to style the tabstrip of the component |
