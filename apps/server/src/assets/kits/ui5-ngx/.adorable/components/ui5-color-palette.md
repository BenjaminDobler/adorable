# ColorPalette

**Type:** Component
**Selector:** `<ui5-color-palette>`
**Import:** `import { ColorPaletteComponent } from '@ui5/webcomponents-ngx/main/color-palette';`
**Export As:** `ui5ColorPalette`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-color-palette (ui5ItemClick)="onItemClick($event)"></ui5-color-palette>
```

## Description
The ui5-color-palette provides the users with a range of predefined colors. The colors are fixed and do not change with the theme. The ui5-color-palette is meant for users that need to select a color from a predefined set. To define the colors, use the ui5-color-palette-item component inside the default slot of the ui5-color-palette. import "@ui5/webcomponents/dist/ColorPalette.js";

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5ItemClick)` | ~~`(item-click)`~~ | Fired when the user selects a color. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the ui5-color-palette-item elements. |
