# AvatarGroup

**Type:** Component
**Selector:** `<ui5-avatar-group>`
**Import:** `import { AvatarGroupComponent } from '@ui5/webcomponents-ngx/main/avatar-group';`
**Export As:** `ui5AvatarGroup`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-avatar-group [type]="..." (ui5Click)="onClick($event)"></ui5-avatar-group>
```

## Description
Displays a group of avatars arranged horizontally. It is useful to visually showcase a group of related avatars, such as, project team members or employees. The component allows you to display the avatars in different sizes, depending on your use case. The AvatarGroup component has two group types: - Group type: The avatars are displayed as partially overlapped on top of each other and the entire group has one click/tap area. - Individual type: The avatars are displayed side-by-side and each avatar has its own click/tap area. Use the AvatarGroup if: - You want to display a group of avatars. - 

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `AvatarGroupType` | `"Group"` | Defines the mode of the AvatarGroup. |
| `accessibilityAttributes` | `AvatarGroupAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following field is supported: |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible name of the AvatarGroup. When provided, this will override the default aria-label text. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(s) of the elements that describe the AvatarGroup. When provided, this will be used as aria-labelledby instea |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the component is activated either with a click/tap or by using the Enter or Space key. |
| `(ui5Overflow)` | ~~`(overflow)`~~ | Fired when the count of visible ui5-avatar elements in the component has changed |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of the component. Use the ui5-avatar component as an item. **Note:** The UX guidelines recommends using avatars with "Circle" shape. |
| `overflowButton` | Defines the overflow button of the component. **Note:** We recommend using the ui5-button component. **Note:** If this slot is not used, the component |
