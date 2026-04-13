# UploadCollection

**Type:** Component
**Selector:** `<ui5-upload-collection>`
**Import:** `import { UploadCollectionComponent } from '@ui5/webcomponents-ngx/fiori/upload-collection';`
**Export As:** `ui5UploadCollection`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-upload-collection [selectionMode]="..." (ui5ItemDelete)="onItemDelete($event)"></ui5-upload-collection>
```

## Description
This component allows you to represent files before uploading them to a server, with the help of ui5-upload-collection-item. It also allows you to show already uploaded files. import "@ui5/webcomponents-fiori/dist/UploadCollection.js"; import "@ui5/webcomponents-fiori/dist/UploadCollectionItem.js"; (for ui5-upload-collection-item)

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `selectionMode` | `UploadCollectionSelectionMode` | `"None"` | Defines the selection mode of the ui5-upload-collection. |
| `noDataDescription` | `string | undefined` | `undefined` | Allows you to set your own text for the 'No data' description. |
| `noDataText` | `string | undefined` | `undefined` | Allows you to set your own text for the 'No data' text. |
| `noDataHeaderLevel` | `TitleLevel` | `"H2"` | Defines the header level of the 'No data' text. |
| `hideDragOverlay` | `boolean` | `false` | By default there will be drag and drop overlay shown over the ui5-upload-collection when files are dragged. If you don't |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5ItemDelete)` | ~~`(item-delete)`~~ | Fired when an element is dropped inside the drag and drop overlay. **Note:** The drop event is fired only when elements  |
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when selection is changed by user interaction in Single and Multiple modes. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of the ui5-upload-collection. **Note:** Use ui5-upload-collection-item for the intended design. |
| `header` | Defines the ui5-upload-collection header. **Note:** If header slot is provided, the labelling of the UploadCollection is a responsibility of the appli |
