# SegmentedButton

**Type:** Component
**Selector:** `<ui5-segmented-button>`
**Import:** `import { SegmentedButtonComponent } from '@ui5/webcomponents-ngx/main/segmented-button';`
**Export As:** `ui5SegmentedButton`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-segmented-button [accessibleName]="..." (ui5SelectionChange)="onSelectionChange($event)"></ui5-segmented-button>
```

## Description
The ui5-segmented-button shows a group of items. When the user clicks or taps one of the items, it stays in a pressed state. It automatically resizes the items to fit proportionally within the component. When no width is set, the component uses the available width. import "@ui5/webcomponents/dist/SegmentedButton.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Defines the IDs of the HTML Elements that label the component. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Defines the IDs of the HTML Elements that describe the component. |
| `selectionMode` | `SegmentedButtonSelectionMode` | `"Single"` | Defines the component selection mode. |
| `itemsFitContent` | `boolean` | `false` | Determines whether the segmented button items should be sized to fit their content. If set to true, each item will be si |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when the selected item changes. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of ui5-segmented-button. **Note:** Multiple items are allowed. **Note:** Use the ui5-segmented-button-item for the intended design. |
