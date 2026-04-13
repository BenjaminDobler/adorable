# ColorPalettePopover

**Type:** Component
**Selector:** `<ui5-color-palette-popover>`
**Import:** `import { ColorPalettePopoverComponent } from '@ui5/webcomponents-ngx/main/color-palette-popover';`
**Export As:** `ui5ColorPalettePopover`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-color-palette-popover [showRecentColors]="..." (ui5ItemClick)="onItemClick($event)"></ui5-color-palette-popover>
```

## Description
Represents a predefined range of colors for easier selection. Overview The ColorPalettePopover provides the users with a slot to predefine colors. You can customize them with the use of the colors property. You can specify a defaultColor and display a "Default color" button for the user to choose directly. You can display a "More colors..." button that opens an additional color picker for the user to choose specific colors that are not present in the predefined range. The palette is intended for users, who don't want to check and remember the different values of the colors and spend large amou

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `showRecentColors` | `boolean` | `false` | Defines whether the user can see the last used colors in the bottom of the component |
| `showMoreColors` | `boolean` | `false` | Defines whether the user can choose a custom color from a component. |
| `showDefaultColor` | `boolean` | `false` | Defines whether the user can choose the default color from a button. |
| `defaultColor` | `string | undefined` | `undefined` | Defines the default color of the component. **Note:** The default color should be a part of the ColorPalette colors` |
| `open` | `boolean` | `false` | Defines the open | closed state of the popover. |
| `opener` | `HTMLElement | string | null | undefined` | `undefined` | Defines the ID or DOM Reference of the element that the popover is shown at. When using this attribute in a declarative  |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5ItemClick)` | ~~`(item-click)`~~ | Fired when the user selects a color. |
| `(ui5Close)` | ~~`(close)`~~ | Fired when the ui5-color-palette-popover is closed due to user interaction. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the component. |
