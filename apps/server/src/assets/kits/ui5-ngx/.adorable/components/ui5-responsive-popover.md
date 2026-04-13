# ResponsivePopover

**Type:** Component
**Selector:** `<ui5-responsive-popover>`
**Import:** `import { ResponsivePopoverComponent } from '@ui5/webcomponents-ngx/main/responsive-popover';`
**Export As:** `ui5ResponsivePopover`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-responsive-popover [initialFocus]="..." (ui5BeforeOpen)="onBeforeOpen($event)"></ui5-responsive-popover>
```

## Description
The ui5-responsive-popover acts as a Popover on desktop and tablet, while on phone it acts as a Dialog. The component improves tremendously the user experience on mobile. Use it when you want to make sure that all the content is visible on any device. import "@ui5/webcomponents/dist/ResponsivePopover.js";

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
| `placement` | `PopoverPlacement` | `"End"` | Determines on which side the component is placed at. |
| `horizontalAlign` | `PopoverHorizontalAlign` | `"Center"` | Determines the horizontal alignment of the component. |
| `verticalAlign` | `PopoverVerticalAlign` | `"Center"` | Determines the vertical alignment of the component. |
| `modal` | `boolean` | `false` | Defines whether the component should close when clicking/tapping outside the popover. If enabled, it blocks any interact |
| `hideArrow` | `boolean` | `false` | Determines whether the component arrow is hidden. |
| `allowTargetOverlap` | `boolean` | `false` | Determines if there is no enough space, the component can be placed over the target. |
| `opener` | `HTMLElement | string | null | undefined` | `undefined` | Defines the ID or DOM Reference of the element at which the popover is shown. When using this attribute in a declarative |

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
| `header` | Defines the header HTML Element. |

## CSS Parts
| Name | Description |
|------|-------------|
| `content` | Used to style the content of the component |
| `footer` | Used to style the footer of the component |
| `header` | Used to style the header of the component |
