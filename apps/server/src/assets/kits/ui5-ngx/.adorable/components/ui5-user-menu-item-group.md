# UserMenuItemGroup

**Type:** Component
**Selector:** `<ui5-user-menu-item-group>`
**Import:** `import { UserMenuItemGroupComponent } from '@ui5/webcomponents-ngx/fiori/user-menu-item-group';`
**Export As:** `ui5UserMenuItemGroup`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-user-menu-item-group [checkMode]="..."></ui5-user-menu-item-group>
```

## Description
The ui5-user-menu-item-group component represents a group of items designed for use inside a ui5-user-menu. Items belonging to the same group should be wrapped by a ui5-user-menu-item-group. Each group can have an itemCheckMode property, which defines the check mode for the items within the group. The possible values for itemCheckMode are: - 'None' (default) - no items can be checked - 'Single' - Only one item can be checked at a time - 'Multiple' - Multiple items can be checked simultaneously **Note:** If the itemCheckMode property is set to 'Single', only one item can remain checked at any g

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `checkMode` | `MenuItemGroupCheckMode` | `"None"` | Defines the component's check mode. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of this component. **Note:** The slot can hold any combination of components of type ui5-menu-item or ui5-menu-separator or both. |
