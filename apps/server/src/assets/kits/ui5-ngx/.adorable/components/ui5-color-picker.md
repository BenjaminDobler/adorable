# ColorPicker

**Type:** Component
**Selector:** `<ui5-color-picker>`
**Import:** `import { ColorPickerComponent } from '@ui5/webcomponents-ngx/main/color-picker';`
**Export As:** `ui5ColorPicker`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-color-picker [value]="..." (ui5Change)="onChange($event)"></ui5-color-picker>
```

## Description
The ui5-color-picker allows users to choose any color and provides different input options for selecting colors. Use the color picker if: - users need to select any color freely. - Users need to select one color from a predefined set of colors. Use the ColorPalette component instead. import "@ui5/webcomponents/dist/ColorPicker.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | `"rgba(255,255,255,1)"` | Defines the currently selected color of the component. **Note**: use HEX, RGB, RGBA, HSV formats or a CSS color name whe |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `simplified` | `boolean` | `false` | When set to true, the alpha slider and inputs for RGB values will not be displayed. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the the selected color is changed |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
