# UserSettingsView

**Type:** Component
**Selector:** `<ui5-user-settings-view>`
**Import:** `import { UserSettingsViewComponent } from '@ui5/webcomponents-ngx/fiori/user-settings-view';`
**Export As:** `ui5UserSettingsView`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-user-settings-view [text]="..."></ui5-user-settings-view>
```

## Description
The ui5-user-settings-view represents a view displayed in the ui5-user-settings-item.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the title text of the user settings view. |
| `selected` | `boolean` | `false` | Defines whether the view is selected. There can be just one selected view at a time. |
| `secondary` | `boolean` | `false` | Indicates whether the view is secondary. It is relevant only if the view is used in pages slot of ui5-user-settings-item |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the view. |
