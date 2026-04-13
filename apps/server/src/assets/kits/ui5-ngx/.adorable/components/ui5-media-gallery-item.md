# MediaGalleryItem

**Type:** Component
**Selector:** `<ui5-media-gallery-item>`
**Import:** `import { MediaGalleryItemComponent } from '@ui5/webcomponents-ngx/fiori/media-gallery-item';`
**Export As:** `ui5MediaGalleryItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-media-gallery-item [selected]="..."></ui5-media-gallery-item>
```

## Description
The ui5-media-gallery-item web component represents the items displayed in the ui5-media-gallery web component. **Note:** ui5-media-gallery-item is not supported when used outside of ui5-media-gallery. The ui5-media-gallery provides advanced keyboard handling. When focused, the user can use the following keyboard shortcuts in order to perform a navigation: - [Space] / [Enter] or [Return] - Trigger ui5-click event import "@ui5/webcomponents-fiori/dist/MediaGalleryItem.js"; (comes with ui5-media-gallery)

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `selected` | `boolean` | `false` | Defines the selected state of the component. |
| `disabled` | `boolean` | `false` | Defines whether the component is in disabled state. |
| `layout` | `MediaGalleryItemLayout` | `"Square"` | Determines the layout of the item container. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the component. |
| `thumbnail` | Defines the content of the thumbnail. |
