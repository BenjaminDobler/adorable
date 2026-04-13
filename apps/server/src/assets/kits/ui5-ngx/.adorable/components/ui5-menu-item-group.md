# MenuItemGroup

**Type:** Component
**Selector:** `<ui5-menu-item-group>`
**Import:** `import { MenuItemGroupComponent } from '@ui5/webcomponents-ngx/main/menu-item-group';`
**Export As:** `ui5MenuItemGroup`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-menu-item-group [checkMode]="..."></ui5-menu-item-group>
```

## Description
The ui5-menu-item-group component represents a group of items designed for use inside a ui5-menu. Items belonging to the same group should be wrapped by a ui5-menu-item-group. Each group can have an checkMode property, which defines the check mode for the items within the group. The possible values for checkMode are: - 'None' (default) - no items can be checked - 'Single' - Only one item can be checked at a time - 'Multiple' - Multiple items can be checked simultaneously **Note:** If the checkMode property is set to 'Single', only one item can remain checked at any given time. If multiple item

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `checkMode` | `MenuItemGroupCheckMode` | `"None"` | Defines the component's check mode. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the items of this component. **Note:** The slot can hold any combination of components of type ui5-menu-item or ui5-menu-separator or both. |
