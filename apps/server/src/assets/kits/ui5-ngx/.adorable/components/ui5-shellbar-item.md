# ShellBarItem

**Type:** Component
**Selector:** `<ui5-shellbar-item>`
**Import:** `import { ShellBarItemComponent } from '@ui5/webcomponents-ngx/fiori/shell-bar-item';`
**Export As:** `ui5ShellbarItem`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-shellbar-item [icon]="..." (ui5Click)="onClick($event)"></ui5-shellbar-item>
```

## Description
The ui5-shellbar-item represents a custom item for ui5-shellbar. import "@ui5/webcomponents-fiori/dist/ShellBarItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `string | undefined` | `undefined` | Defines the item's icon. |
| `text` | `string | undefined` | `undefined` | Defines the item text. **Note:** The text is only displayed inside the overflow popover list view. |
| `count` | `string | undefined` | `undefined` | Defines the count displayed in badge. |
| `accessibilityAttributes` | `ShellBarItemAccessibilityAttributes` | `{}` | Defines additional accessibility attributes on Shellbar Items. The accessibility attributes support the following values |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the item is clicked. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.
