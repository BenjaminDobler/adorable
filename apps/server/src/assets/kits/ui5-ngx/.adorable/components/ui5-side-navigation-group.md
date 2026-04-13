# SideNavigationGroup

**Type:** Component
**Selector:** `<ui5-side-navigation-group>`
**Import:** `import { SideNavigationGroupComponent } from '@ui5/webcomponents-ngx/fiori/side-navigation-group';`
**Export As:** `ui5SideNavigationGroup`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-side-navigation-group [text]="..."></ui5-side-navigation-group>
```

## Description
Represents a group of navigation actions within ui5-side-navigation. The ui5-side-navigation-group can only be used inside a ui5-side-navigation. import "@ui5/webcomponents-fiori/dist/SideNavigationGroup.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | Defines the text of the item. |
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. A disabled component can't be pressed or focused, and it is not in the tab ch |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the component. A tooltip attribute should be provided, in order to represent meaning/function, wh |
| `expanded` | `boolean` | `false` | Defines if the item is expanded |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines nested items by passing ui5-side-navigation-item to the default slot. |
