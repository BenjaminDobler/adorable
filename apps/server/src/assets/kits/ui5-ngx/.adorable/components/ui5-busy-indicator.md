# BusyIndicator

**Type:** Component
**Selector:** `<ui5-busy-indicator>`
**Import:** `import { BusyIndicatorComponent } from '@ui5/webcomponents-ngx/main/busy-indicator';`
**Export As:** `ui5BusyIndicator`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-busy-indicator [text]="..."></ui5-busy-indicator>
```

## Description
The ui5-busy-indicator signals that some operation is going on and that the user must wait. It does not block the current UI screen so other operations could be triggered in parallel. It displays 3 dots and each dot expands and shrinks at a different rate, resulting in a cascading flow of animation. For the ui5-busy-indicator you can define the size, the text and whether it is shown or hidden. In order to hide it, use the "active" property. In order to show busy state over an HTML element, simply nest the HTML element in a ui5-busy-indicator instance. **Note:** Since ui5-busy-indicator has dis

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines text to be displayed below the component. It can be used to inform the user of the current operation. |
| `size` | `BusyIndicatorSize` | `"M"` | Defines the size of the component. |
| `active` | `boolean` | `false` | Defines if the busy indicator is visible on the screen. By default it is not. |
| `delay` | `number` | `1000` | Defines the delay in milliseconds, after which the busy indicator will be visible on the screen. |
| `textPlacement` | `BusyIndicatorTextPlacement` | `"Bottom"` | Defines the placement of the text. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Determines the content over which the component will appear. |
