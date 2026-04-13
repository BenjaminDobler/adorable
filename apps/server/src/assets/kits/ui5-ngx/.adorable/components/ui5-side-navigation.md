# SideNavigation

**Type:** Component
**Selector:** `<ui5-side-navigation>`
**Import:** `import { SideNavigationComponent } from '@ui5/webcomponents-ngx/fiori/side-navigation';`
**Export As:** `ui5SideNavigation`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-side-navigation [collapsed]="..." (ui5SelectionChange)="onSelectionChange($event)"></ui5-side-navigation>
```

## Description
The SideNavigation is used as a standard menu in applications. It consists of three containers: header (top-aligned), main navigation section (top-aligned) and the secondary section (bottom-aligned). - The header is meant for displaying user related information - profile data, avatar, etc. - The main navigation section is related to the user's current work context. - The secondary section is mostly used to link additional information that may be of interest (legal information, developer communities, external help, contact information and so on). Use the available ui5-side-navigation-group, ui5

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `collapsed` | `boolean` | `false` | Defines whether the ui5-side-navigation is expanded or collapsed. **Note:** On small screens (screen width of 599px or l |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when the selection has changed via user interaction. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the main items of the component. |
| `fixedItems` | Defines the fixed items at the bottom of the component. **Note:** In order to achieve the best user experience, it is recommended that you keep the fi |
| `header` | Defines the header of the ui5-side-navigation. **Note:** The header is displayed when the component is expanded - the property collapsed is false; |
