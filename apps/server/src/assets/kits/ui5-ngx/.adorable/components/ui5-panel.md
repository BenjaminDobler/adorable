# Panel

**Type:** Component
**Selector:** `<ui5-panel>`
**Import:** `import { PanelComponent } from '@ui5/webcomponents-ngx/main/panel';`
**Export As:** `ui5Panel`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-panel [headerText]="..." (ui5Toggle)="onToggle($event)"></ui5-panel>
```

## Description
The ui5-panel component is a container which has a header and a content area and is used for grouping and displaying information. It can be collapsed to save space on the screen. - Nesting two or more panels is not recommended. - Do not stack too many panels on one page. The panel's header area consists of a title bar with a header text or custom header. The header is clickable and can be used to toggle between the expanded and collapsed state. It includes an icon which rotates depending on the state. The custom header can be set through the header slot and it may contain arbitraray content, s

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `headerText` | `string | undefined` | `undefined` | This property is used to set the header text of the component. The text is visible in both expanded and collapsed states |
| `fixed` | `boolean` | `false` | Determines whether the component is in a fixed state that is not expandable/collapsible by user interaction. |
| `collapsed` | `boolean` | `false` | Indicates whether the component is collapsed and only the header is displayed. |
| `noAnimation` | `boolean` | `false` | Indicates whether the transition between the expanded and the collapsed state of the component is animated. By default t |
| `accessibleRole` | `PanelAccessibleRole` | `"Form"` | Sets the accessible ARIA role of the component. Depending on the usage, you can change the role from the default Form to |
| `headerLevel` | `TitleLevel` | `"H2"` | Defines the "aria-level" of component heading, set by the headerText. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `stickyHeader` | `boolean` | `false` | Indicates whether the Panel header is sticky or not. If stickyHeader is set to true, then whenever you scroll the conten |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Toggle)` | ~~`(toggle)`~~ | Fired when the component is expanded/collapsed by user interaction. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the component. The content is visible only when the component is expanded. |
| `header` | Defines the component header area. **Note:** When a header is provided, the headerText property is ignored. |

## CSS Parts
| Name | Description |
|------|-------------|
| `content` | Used to style the wrapper of the content. |
| `header` | Used to style the wrapper of the header. |
