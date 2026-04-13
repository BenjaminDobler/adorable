# Dialog

**Type:** Component
**Selector:** `<ui5-dialog>`
**Import:** `import { DialogComponent } from '@ui5/webcomponents-ngx/main/dialog';`
**Export As:** `ui5Dialog`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-dialog [initialFocus]="..." (ui5BeforeOpen)="onBeforeOpen($event)"></ui5-dialog>
```

## Description
The ui5-dialog component is used to temporarily display some information in a size-limited window in front of the regular app screen. It is used to prompt the user for an action or a confirmation. The ui5-dialog interrupts the current app processing as it is the only focused UI element and the main screen is dimmed/blocked. The dialog combines concepts known from other technologies where the windows have names such as dialog box, dialog window, pop-up, pop-up window, alert box, or message box. The ui5-dialog is modal, which means that a user action is required before it is possible to return t

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `initialFocus` | `string | undefined` | `undefined` | Defines the ID of the HTML Element, which will get the initial focus. **Note:** If an element with autofocus attribute i |
| `preventFocusRestore` | `boolean` | `false` | Defines if the focus should be returned to the previously focused element, when the popup closes. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Defines the IDs of the elements that label the component. |
| `accessibleRole` | `PopupAccessibleRole` | `"Dialog"` | Allows setting a custom role. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that describe the component. |
| `preventInitialFocus` | `boolean` | `false` | Indicates whether initial focus should be prevented. |
| `open` | `boolean` | `false` | Indicates if the element is open |
| `headerText` | `string | undefined` | `undefined` | Defines the header text. **Note:** If header slot is provided, the headerText is ignored. |
| `stretch` | `boolean` | `false` | Determines if the dialog will be stretched to full screen on mobile. On desktop, the dialog will be stretched to approxi |
| `draggable` | `boolean` | `false` | Determines whether the component is draggable. If this property is set to true, the Dialog will be draggable by its head |
| `resizable` | `boolean` | `false` | Configures the component to be resizable. If this property is set to true, the Dialog will have a resize handle in its b |
| `state` | `ValueState` | `"None"` | Defines the state of the Dialog. **Note:** If "Negative" and "Critical" states is set, it will change the accessibility  |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5BeforeOpen)` | ~~`(before-open)`~~ | Fired before the component is opened. This event can be cancelled, which will prevent the popup from opening. |
| `(ui5Open)` | ~~`(open)`~~ | Fired after the component is opened. |
| `(ui5BeforeClose)` | ~~`(before-close)`~~ | Fired before the component is closed. This event can be cancelled, which will prevent the popup from closing. |
| `(ui5Close)` | ~~`(close)`~~ | Fired after the component is closed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the Popup. |
| `footer` | Defines the footer HTML Element. |
| `header` | Defines the header HTML Element. **Note:** If header slot is provided, the labelling of the dialog is a responsibility of the application developer. a |

## CSS Parts
| Name | Description |
|------|-------------|
| `content` | Used to style the content of the component |
| `footer` | Used to style the footer of the component |
| `header` | Used to style the header of the component |
