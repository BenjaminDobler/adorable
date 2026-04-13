# NavigationLayout

**Type:** Component
**Selector:** `<ui5-navigation-layout>`
**Import:** `import { NavigationLayoutComponent } from '@ui5/webcomponents-ngx/fiori/navigation-layout';`
**Export As:** `ui5NavigationLayout`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-navigation-layout [mode]="..."></ui5-navigation-layout>
```

## Description
The ui5-navigation-layout is a container component that can be used to create a layout with a header, a side navigation and a content area. Use the ui5-navigation-layout to create whole screen of an application with vertical navigation. On larger screens with a width of 600px or more, excluding mobile phone devices, the side navigation is visible by default and can be expanded or collapsed using the mode property. On mobile phone devices and screens with a width of 599px or less, the side navigation is hidden by default and can be displayed using the mode property. import "@ui5/webcomponents-f

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `NavigationLayoutMode` | `"Auto"` | Specifies the navigation layout mode. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content. |
| `header` | Defines the header. |
| `sideContent` | Defines the side content. |
