# BarcodeScannerDialog

**Type:** Component
**Selector:** `<ui5-barcode-scanner-dialog>`
**Import:** `import { BarcodeScannerDialogComponent } from '@ui5/webcomponents-ngx/fiori/barcode-scanner-dialog';`
**Export As:** `ui5BarcodeScannerDialog`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-barcode-scanner-dialog [open]="..." (ui5Close)="onClose($event)"></ui5-barcode-scanner-dialog>
```

## Description
The BarcodeScannerDialog component provides barcode scanning functionality for all devices that support the MediaDevices.getUserMedia() native API. Opening the dialog launches the device camera and scans for known barcode formats. A scanSuccess event fires whenever a barcode is identified and a scanError event fires when the scan failed (for example, due to missing permisions). Internally, the component uses the zxing-js/library third party OSS. For a list of supported barcode formats, see the [zxing-js/library](https://github.com/zxing-js/library) documentation.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | `false` | Indicates whether the dialog is open. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Close)` | ~~`(close)`~~ | Fired when the user closes the component. |
| `(ui5ScanSuccess)` | ~~`(scan-success)`~~ | Fires when the scan is completed successfuuly. |
| `(ui5ScanError)` | ~~`(scan-error)`~~ | Fires when the scan fails with error. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `footer` | Defines the footer HTML Element. **Note:** When you provide custom content for the footer slot, the default close button is not rendered. This means y |
| `header` | Defines the header HTML Element. **Note:** If header slot is provided, the labelling of the dialog is a responsibility of the application developer. a |
