# DynamicPage

**Type:** Component
**Selector:** `<ui5-dynamic-page>`
**Import:** `import { DynamicPageComponent } from '@ui5/webcomponents-ngx/fiori/dynamic-page';`
**Export As:** `ui5DynamicPage`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-dynamic-page [hidePinButton]="..." (ui5PinButtonToggle)="onPinButtonToggle($event)"></ui5-dynamic-page>
```

## Description
A layout component, representing a web page, consisting of a title, header with dynamic behavior, a content area, and an optional floating footer. The component consist of several components: - DynamicPageTitle - a component, holding the title of the page, the navigation actions and the content. The displayed content changes based on the current mode of the DynamicPageHeader. - DynamicPageHeader - a generic container, which can contain a single layout component and any other HTML elements. The header works in two modes - expanded and snapped and its behavior can be adjusted with the help of di

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `hidePinButton` | `boolean` | `false` | Defines if the pin button is hidden. |
| `headerPinned` | `boolean` | `false` | Defines if the header is pinned. |
| `showFooter` | `boolean` | `false` | Defines if the footer is shown. |
| `headerSnapped` | `boolean` | `false` | Defines if the header is snapped. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5PinButtonToggle)` | ~~`(pin-button-toggle)`~~ | Fired when the pin header button is toggled. |
| `(ui5TitleToggle)` | ~~`(title-toggle)`~~ | Fired when the expand/collapse area of the title is toggled. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the Dynamic Page. |
| `footerArea` | Defines the footer HTML Element. |
| `headerArea` | Defines the header HTML Element. |
| `titleArea` | Defines the title HTML Element. |

## CSS Parts
| Name | Description |
|------|-------------|
| `content` | Used to style the content of the component |
| `fit-content` | Used to style the fit content container of the component. |
| `footer` | Used to style the footer of the component |
