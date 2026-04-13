# ShellBarBranding

**Type:** Component
**Selector:** `<ui5-shellbar-branding>`
**Import:** `import { ShellBarBrandingComponent } from '@ui5/webcomponents-ngx/fiori/shell-bar-branding';`
**Export As:** `ui5ShellbarBranding`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-shellbar-branding [href]="..." (ui5Click)="onClick($event)"></ui5-shellbar-branding>
```

## Description
The ui5-shellbar-branding component is intended to be placed inside the branding slot of the ui5-shellbar component. Its content has higher priority than the primaryTitle property and the logo slot of ui5-shellbar.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `href` | `string | undefined` | `undefined` | Defines the component href. **Note:** Standard hyperlink behavior is supported. |
| `target` | `string | undefined` | `undefined` | Defines the component target. **Notes:** - _self - _top - _blank - _parent - _search **This property must only be used w |
| `accessibleName` | `string | undefined` | `undefined` | Defines the text alternative of the component. If not provided a default text alternative will be set, if present. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired, when the logo is activated. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the title for the ui5-shellbar-branding component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you onl |
| `logo` | Defines the logo of the ui5-shellbar. For example, you can use ui5-avatar or img elements as logo. |
