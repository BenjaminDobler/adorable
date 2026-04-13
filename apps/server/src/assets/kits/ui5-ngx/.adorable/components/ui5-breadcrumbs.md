# Breadcrumbs

**Type:** Component
**Selector:** `<ui5-breadcrumbs>`
**Import:** `import { BreadcrumbsComponent } from '@ui5/webcomponents-ngx/main/breadcrumbs';`
**Export As:** `ui5Breadcrumbs`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-breadcrumbs [design]="..." (ui5ItemClick)="onItemClick($event)"></ui5-breadcrumbs>
```

## Description
Enables users to navigate between items by providing a list of links to previous steps in the user's navigation path. It helps the user to be aware of their location within the application and allows faster navigation. The last three steps can be accessed as links directly, while the remaining links prior to them are available in a drop-down menu. You can choose the type of separator to be used from a number of predefined options. The ui5-breadcrumbs provides advanced keyboard handling. - [F4], [Alt] + [Up], [Alt] + [Down], [Space], or [Enter] - If the dropdown arrow is focused - opens/closes 

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `design` | `BreadcrumbsDesign` | `"Standard"` | Defines the visual appearance of the last BreadcrumbsItem. The Breadcrumbs supports two visual appearances for the last  |
| `separators` | `BreadcrumbsSeparator` | `"Slash"` | Determines the visual style of the separator between the breadcrumb items. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5ItemClick)` | ~~`(item-click)`~~ | Fires when a BreadcrumbsItem is clicked. **Note:** You can prevent browser location change by calling event.preventDefau |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the component items. **Note:** Use the ui5-breadcrumbs-item component to define the desired items. |
