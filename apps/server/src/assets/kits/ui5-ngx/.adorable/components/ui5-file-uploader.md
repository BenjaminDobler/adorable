# FileUploader

**Type:** Component
**Selector:** `<ui5-file-uploader>`
**Import:** `import { FileUploaderComponent } from '@ui5/webcomponents-ngx/main/file-uploader';`
**Export As:** `ui5FileUploader`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-file-uploader [accept]="..." (ui5Change)="onChange($event)"></ui5-file-uploader>
```

## Description
The ui5-file-uploader opens a file explorer dialog and enables users to upload files. The component consists of input field, but you can provide an HTML element by your choice to trigger the file upload, by using the default slot. Furthermore, you can set the property "hideInput" to "true" to hide the input field. To get all selected files, you can simply use the read-only "files" property. To restrict the types of files the user can select, you can use the "accept" property. And, similar to all input based components, the FileUploader supports "valueState", "placeholder", "name", and "disable

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `accept` | `string | undefined` | `undefined` | Comma-separated list of file types that the component should accept. **Note:** Please make sure you are adding the . in  |
| `hideInput` | `boolean` | `false` | If set to "true", the input field of component will not be rendered. Only the default slot that is passed will be render |
| `disabled` | `boolean` | `false` | Defines whether the component is in disabled state. **Note:** A disabled component is completely noninteractive. |
| `multiple` | `boolean` | `false` | Allows multiple files to be chosen. |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `placeholder` | `string | undefined` | `undefined` | Defines a short hint intended to aid the user with data entry when the component has no value. |
| `value` | `string` | `""` | Defines the name/names of the file/files to upload. |
| `maxFileSize` | `number | undefined` | `undefined` | Defines the maximum file size in megabytes which prevents the upload if at least one file exceeds it. |
| `valueState` | `ValueState` | `"None"` | Defines the value state of the component. |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the input. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that describe the input. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Event is fired when the value of the file path has been changed. **Note:** Keep in mind that because of the HTML input e |
| `(ui5FileSizeExceed)` | ~~`(file-size-exceed)`~~ | Event is fired when the size of a file is above the maxFileSize property value. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | This slot allows you to add custom content to the component, such as a button or any other interactive element to trigger the file selection dialog. * |
| `valueStateMessage` | Defines the value state message that will be displayed as pop up under the component. **Note:** If not specified, a default text (in the respective la |
