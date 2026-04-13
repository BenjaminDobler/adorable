# MessageStrip

**Type:** Component
**Selector:** `<ui5-message-strip>`
**Import:** `import { MessageStripComponent } from '@ui5/webcomponents-ngx/main/message-strip';`
**Export As:** `ui5MessageStrip`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-message-strip [design]="..." (ui5Close)="onClose($event)"></ui5-message-strip>
```

## Description
The ui5-message-strip component allows for the embedding of application-related messages. It supports four semantic designs, each with its own color and icon: "Information", "Positive", "Critical", and "Negative". Additionally, users can choose from two color sets ("ColorSet1" and "ColorSet2"), each containing 10 predefined color schemes. Each message shows a "Close" button, so that it can be removed from the UI, if needed. For the ui5-message-strip component, you can define whether it displays an icon in the beginning and a close button. Moreover, its size and background can be controlled wit

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `design` | `MessageStripDesign` | `"Information"` | Defines the component type. |
| `colorScheme` | `string` | `"1"` | Defines the color scheme of the component. There are 10 predefined schemes. To use one you can set a number from "1" to  |
| `hideIcon` | `boolean` | `false` | Defines whether the MessageStrip will show an icon in the beginning. You can directly provide an icon with the icon slot |
| `hideCloseButton` | `boolean` | `false` | Defines whether the MessageStrip renders close button. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Close)` | ~~`(close)`~~ | Fired when the close button is pressed either with a click/tap or by using the Enter or Space key. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |
| `icon` | Defines the content to be displayed as graphical element within the component. **Note:** If no icon is given, the default icon for the component type  |
