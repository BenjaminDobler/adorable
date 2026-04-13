# UploadCollectionItem

**Type:** Component
**Selector:** `<ui5-upload-collection-item>`
**Import:** `import { UploadCollectionItemComponent } from '@ui5/webcomponents-ngx/fiori/upload-collection-item';`
**Export As:** `ui5UploadCollectionItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-upload-collection-item [type]="..." (ui5DetailClick)="onDetailClick($event)"></ui5-upload-collection-item>
```

## Description
A component to be used within the ui5-upload-collection. import "@ui5/webcomponents-fiori/dist/UploadCollectionItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `ListItemType` | `"Active"` | Defines the visual indication and behavior of the list items. Available options are Active (by default), Inactive, Detai |
| `accessibilityAttributes` | `ListItemAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following fields are supporte |
| `navigated` | `boolean` | `false` | The navigated state of the list item. If set to true, a navigation indicator is displayed at the end of the list item. |
| `tooltip` | `string | undefined` | `undefined` | Defines the text of the tooltip that would be displayed for the list item. |
| `highlight` | `Highlight` | `"None"` | Defines the highlight state of the list items. Available options are: "None" (by default), "Positive", "Critical", "Info |
| `selected` | `boolean` | `false` | Defines the selected state of the component. |
| `file` | `File | null` | `null` | Holds an instance of File associated with this item. |
| `fileName` | `string` | `""` | The name of the file. |
| `fileNameClickable` | `boolean` | `false` | If set to true the file name will be clickable and it will fire file-name-click event upon click. |
| `disableDeleteButton` | `boolean` | `false` | Disables the delete button. |
| `hideDeleteButton` | `boolean` | `false` | Hides the delete button. |
| `hideRetryButton` | `boolean` | `false` | Hides the retry button when uploadState property is Error. |
| `hideTerminateButton` | `boolean` | `false` | Hides the terminate button when uploadState property is Uploading. |
| `progress` | `number` | `0` | The upload progress in percentage. **Note:** Expected values are in the interval [0, 100]. |
| `uploadState` | `UploadState` | `"Ready"` | Upload state. Depending on this property, the item displays the following: - Ready - progress indicator is displayed. -  |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5DetailClick)` | ~~`(detail-click)`~~ | Fired when the user clicks on the detail button when type is Detail. |
| `(ui5FileNameClick)` | ~~`(file-name-click)`~~ | Fired when the file name is clicked. **Note:** This event is only available when fileNameClickable property is true. |
| `(ui5Rename)` | ~~`(rename)`~~ | Fired when the fileName property gets changed. **Note:** An edit button is displayed on each item, when the ui5-upload-c |
| `(ui5Terminate)` | ~~`(terminate)`~~ | Fired when the terminate button is pressed. **Note:** Terminate button is displayed when uploadState property is set to  |
| `(ui5Retry)` | ~~`(retry)`~~ | Fired when the retry button is pressed. **Note:** Retry button is displayed when uploadState property is set to Error. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Hold the description of the ui5-upload-collection-item. Will be shown below the file name. |
| `thumbnail` | A thumbnail, which will be shown in the beginning of the ui5-upload-collection-item. **Note:** Use ui5-icon or img for the intended design. |
| `deleteButton` | Defines the delete button, displayed in "Delete" mode. **Note:** While the slot allows custom buttons, to match design guidelines, please use the ui5- |
