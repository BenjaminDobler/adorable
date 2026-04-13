# Icon

**Type:** Component
**Selector:** `<ui5-icon>`
**Import:** `import { IconComponent } from '@ui5/webcomponents-ngx/main/icon';`
**Export As:** `ui5Icon`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-icon [design]="..." (ui5Click)="onClick($event)"></ui5-icon>
```

## Description
The ui5-icon component represents an SVG icon. There are two main scenarios how the ui5-icon component is used: as a purely decorative element, or as an interactive element that can be focused and clicked. 1. **Get familiar with the icons collections.** Before displaying an icon, you need to explore the icons collections to find and import the desired icon. Currently there are 3 icons collection, available as 3 npm packages: - [@ui5/webcomponents-icons](https://www.npmjs.com/package/@ui5/webcomponents-icons) represents the "SAP-icons" collection and includes the following [icons](https://sdk.o

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `design` | `IconDesign` | `"Default"` | Defines the component semantic design. |
| `name` | `string | undefined` | `undefined` | Defines the unique identifier (icon name) of the component. To browse all available icons, see the [SAP Icons](https://s |
| `accessibleName` | `string | undefined` | `undefined` | Defines the text alternative of the component. If not provided a default text alternative will be set, if present. **Not |
| `showTooltip` | `boolean` | `false` | Defines whether the component should have a tooltip. **Note:** The tooltip text should be provided via the accessible-na |
| `mode` | `IconMode` | `"Decorative"` | Defines the mode of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the component is activated by mouse/touch, keyboard (Enter or Space), or screen reader virtual cursor activat |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## CSS Parts
| Name | Description |
|------|-------------|
| `root` | Used to style the outermost wrapper of the ui5-icon. |
