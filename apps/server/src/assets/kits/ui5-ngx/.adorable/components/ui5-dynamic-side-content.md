# DynamicSideContent

**Type:** Component
**Selector:** `<ui5-dynamic-side-content>`
**Import:** `import { DynamicSideContentComponent } from '@ui5/webcomponents-ngx/fiori/dynamic-side-content';`
**Export As:** `ui5DynamicSideContent`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-dynamic-side-content [hideMainContent]="..." (ui5LayoutChange)="onLayoutChange($event)"></ui5-dynamic-side-content>
```

## Description
The DynamicSideContent (ui5-dynamic-side-content) is a layout component that allows additional content to be displayed in a way that flexibly adapts to different screen sizes. The side content appears in a container next to or directly below the main content (it doesn't overlay). When the side content is triggered, the main content becomes narrower (if appearing side-by-side). The side content contains a separate scrollbar when appearing next to the main content. *When to use?* Use this component if you want to display relevant information that is not critical for users to complete a task. Use

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `hideMainContent` | `boolean` | `false` | Defines the visibility of the main content. |
| `hideSideContent` | `boolean` | `false` | Defines the visibility of the side content. |
| `sideContentPosition` | `SideContentPosition` | `"End"` | Defines whether the side content is positioned before the main content (left side in LTR mode), or after the the main co |
| `sideContentVisibility` | `SideContentVisibility` | `"ShowAboveS"` | Defines on which breakpoints the side content is visible. |
| `sideContentFallDown` | `SideContentFallDown` | `"OnMinimumWidth"` | Defines on which breakpoints the side content falls down below the main content. |
| `equalSplit` | `boolean` | `false` | Defines whether the component is in equal split mode. In this mode, the side and the main content take 50:50 percent of  |
| `accessibilityAttributes` | `DynamicSideContentAccessibilityAttributes` | `{}` | Defines additional accessibility attributes on different areas of the component. The accessibilityAttributes object has  |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5LayoutChange)` | ~~`(layout-change)`~~ | Fires when the current breakpoint has been changed. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the main content. |
| `sideContent` | Defines the side content. |
