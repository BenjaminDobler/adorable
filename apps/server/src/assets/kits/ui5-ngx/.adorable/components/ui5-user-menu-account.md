# UserMenuAccount

**Type:** Component
**Selector:** `<ui5-user-menu-account>`
**Import:** `import { UserMenuAccountComponent } from '@ui5/webcomponents-ngx/fiori/user-menu-account';`
**Export As:** `ui5UserMenuAccount`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-user-menu-account [avatarSrc]="..."></ui5-user-menu-account>
```

## Description
The ui5-user-menu-account represents an account in the ui5-user-menu. import "@ui5/webcomponents-fiori/dist/UserMenuAccount.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `avatarSrc` | `string | undefined` | `""` | Defines the avatar image url of the user. |
| `avatarInitials` | `string | undefined` | `undefined` | Defines the avatar initials of the user. |
| `titleText` | `string` | `""` | Defines the title text of the user. |
| `subtitleText` | `string` | `""` | Defines additional text of the user. |
| `description` | `string` | `""` | Defines description of the user. |
| `additionalInfo` | `string` | `""` | Defines additional information for the user. |
| `selected` | `boolean` | `false` | Defines if the user is selected. |
| `loading` | `boolean` | `false` | Indicates whether a loading indicator should be shown. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
