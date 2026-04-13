# Toast

**Type:** Component
**Selector:** `<ui5-toast>`
**Import:** `import { ToastComponent } from '@ui5/webcomponents-ngx/main/toast';`
**Export As:** `ui5Toast`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-toast [duration]="..." (ui5Close)="onClose($event)"></ui5-toast>
```

## Description
The ui5-toast is a small, non-disruptive popup for success or information messages that disappears automatically after a few seconds. - You want to display a short success or information message. - You do not want to interrupt users while they are performing an action. - You want to confirm a successful action. - You want to display error or warning message. - You want to interrupt users while they are performing an action. - You want to make sure that users read the message before they leave the page. - You want users to be able to copy some part of the message text. import "@ui5/webcomponent

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `duration` | `number` | `3000` | Defines the duration in milliseconds for which component remains on the screen before it's automatically closed. **Note: |
| `placement` | `ToastPlacement` | `"BottomCenter"` | Defines the placement of the component. |
| `open` | `boolean` | `false` | Indicates whether the component is open (visible). |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Close)` | ~~`(close)`~~ | Fired after the component is auto closed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |
