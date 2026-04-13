# UserSettingsAppearanceView

**Type:** Component
**Selector:** `<ui5-user-settings-appearance-view>`
**Import:** `import { UserSettingsAppearanceViewComponent } from '@ui5/webcomponents-ngx/fiori/user-settings-appearance-view';`
**Export As:** `ui5UserSettingsAppearanceView`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-user-settings-appearance-view [text]="..." (ui5SelectionChange)="onSelectionChange($event)"></ui5-user-settings-appearance-view>
```

## Description
The ui5-user-settings-appearance-view represents a view displayed in the ui5-user-settings-item. import "@ui5/webcomponents-fiori/dist/UserSettingsAppearanceView.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the title text of the user settings view. |
| `selected` | `boolean` | `false` | Defines whether the view is selected. There can be just one selected view at a time. |
| `secondary` | `boolean` | `false` | Indicates whether the view is secondary. It is relevant only if the view is used in pages slot of ui5-user-settings-item |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when an item is selected. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `additionalContent` | Defines additional content displayed below the items list. |
| `default` | Defines the items of the component. |
