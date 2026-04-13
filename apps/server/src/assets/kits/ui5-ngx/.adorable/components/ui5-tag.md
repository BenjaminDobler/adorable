# Tag

**Type:** Component
**Selector:** `<ui5-tag>`
**Import:** `import { TagComponent } from '@ui5/webcomponents-ngx/main/tag';`
**Export As:** `ui5Tag`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-tag [design]="..." (ui5Click)="onClick($event)"></ui5-tag>
```

## Description
The ui5-tag is a component which serves the purpose to attract the user attention to some piece of information (state, quantity, condition, etc.). It can contain icon and text information, and its design can be chosen from specific design types. - If the text is longer than the width of the component, it can wrap, or it can show ellipsis, depending on the wrappingType property. - Colors can be semantic or not semantic. import "@ui5/webcomponents/dist/Tag.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `design` | `TagDesign` | `"Neutral"` | Defines the design type of the component. |
| `colorScheme` | `string` | `"1"` | Defines the color scheme of the component. There are 10 predefined schemes. To use one you can set a number from "1" to  |
| `hideStateIcon` | `boolean` | `false` | Defines if the default state icon is shown. |
| `interactive` | `boolean` | `false` | Defines if the component is interactive (focusable and pressable). |
| `wrappingType` | `WrappingType` | `"Normal"` | Defines how the text of a component will be displayed when there is not enough space. **Note:** For option "Normal" the  |
| `size` | `TagSize` | `"S"` | Defines predefined size of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the user clicks on an interactive tag. **Note:** The event will be fired if the interactive property is true |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |
| `icon` | Defines the icon to be displayed in the component. |

## CSS Parts
| Name | Description |
|------|-------------|
| `root` | Used to style the root element. |
