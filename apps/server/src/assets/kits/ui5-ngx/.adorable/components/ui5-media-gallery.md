# MediaGallery

**Type:** Component
**Selector:** `<ui5-media-gallery>`
**Import:** `import { MediaGalleryComponent } from '@ui5/webcomponents-ngx/fiori/media-gallery';`
**Export As:** `ui5MediaGallery`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-media-gallery [showAllThumbnails]="..." (ui5SelectionChange)="onSelectionChange($event)"></ui5-media-gallery>
```

## Description
The ui5-media-gallery component allows the user to browse through multimedia items. Currently, the supported items are images and videos. The items should be defined using the ui5-media-gallery-item component. The items are initially displayed as thumbnails. When the user selects a thumbnail, the corresponding item is displayed in larger size. The component is responsive by default and adjusts the position of the menu with respect to viewport size, but the application is able to further customize the layout via the provided API. The ui5-media-gallery provides advanced keyboard handling. When t

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `showAllThumbnails` | `boolean` | `false` | If set to true, all thumbnails are rendered in a scrollable container. If false, only up to five thumbnails are rendered |
| `interactiveDisplayArea` | `boolean` | `false` | If enabled, a display-area-click event is fired when the user clicks or taps on the display area. The display area is th |
| `layout` | `MediaGalleryLayout` | `"Auto"` | Determines the layout of the component. |
| `menuHorizontalAlign` | `MediaGalleryMenuHorizontalAlign` | `"Left"` | Determines the horizontal alignment of the thumbnails menu vs. the central display area. |
| `menuVerticalAlign` | `MediaGalleryMenuVerticalAlign` | `"Bottom"` | Determines the vertical alignment of the thumbnails menu vs. the central display area. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when selection is changed by user interaction. |
| `(ui5OverflowClick)` | ~~`(overflow-click)`~~ | Fired when the thumbnails overflow button is clicked. |
| `(ui5DisplayAreaClick)` | ~~`(display-area-click)`~~ | Fired when the display area is clicked. The display area is the central area that contains the enlarged content of the c |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the component items. **Note:** Only one selected item is allowed. **Note:** Use the ui5-media-gallery-item component to define the desired ite |
