# FlexibleColumnLayout

**Type:** Component
**Selector:** `<ui5-flexible-column-layout>`
**Import:** `import { FlexibleColumnLayoutComponent } from '@ui5/webcomponents-ngx/fiori/flexible-column-layout';`
**Export As:** `ui5FlexibleColumnLayout`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-flexible-column-layout [layout]="..." (ui5LayoutChange)="onLayoutChange($event)"></ui5-flexible-column-layout>
```

## Description
The FlexibleColumnLayout implements the list-detail-detail paradigm by displaying up to three pages in separate columns. There are several possible layouts that can be changed either with the component API, or by dragging the column separators. Use this component for applications that need to display several logical levels of related information side by side (e.g. list of items, item, sub-item, etc.). The Component is flexible in a sense that the application can focus the user's attention on one particular column. The FlexibleColumnLayout automatically displays the maximum possible number of c

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `layout` | `FCLLayout` | `"OneColumn"` | Defines the columns layout and their proportion. **Note:** The layout also depends on the screen size - one column for s |
| `disableResizing` | `boolean` | `false` | Specifies if the user is allowed to change the columns layout by dragging the separator between the columns. |
| `accessibilityAttributes` | `FCLAccessibilityAttributes` | `{}` | Defines additional accessibility attributes on different areas of the component. The accessibilityAttributes object has  |
| `layoutsConfiguration` | `LayoutConfiguration` | `{}` | Allows to customize the column proportions per screen size and layout. If no custom proportion provided for a specific l |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5LayoutChange)` | ~~`(layout-change)`~~ | Fired when the layout changes via user interaction by dragging the separators or by changing the component size due to r |
| `(ui5LayoutConfigurationChange)` | ~~`(layout-configuration-change)`~~ | Fired when the layoutsConfiguration changes via user interaction by dragging the separators. **Note:** The layout-config |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `endColumn` | Defines the content in the end column. |
| `midColumn` | Defines the content in the middle column. |
| `startColumn` | Defines the content in the start column. |
