# Carousel

**Type:** Component
**Selector:** `<ui5-carousel>`
**Import:** `import { CarouselComponent } from '@ui5/webcomponents-ngx/main/carousel';`
**Export As:** `ui5Carousel`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-carousel [accessibleName]="..." (ui5Navigate)="onNavigate($event)"></ui5-carousel>
```

## Description
The Carousel allows the user to browse through a set of items. The component is mostly used for showing a gallery of images, but can hold any other HTML element. There are several ways to perform navigation: - on desktop - the user can navigate using the navigation arrows or with keyboard shortcuts. - on touch devices - the user can navigate using the navigation arrows (always visible) or can use swipe gestures. - The items you want to display are very different from each other. - You want to display the items one after the other. - The items you want to display need to be visible at the same 

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Defines the IDs of the elements that label the input. |
| `cyclic` | `boolean` | `false` | Defines whether the carousel should loop, i.e show the first page after the last page is reached and vice versa. |
| `itemsPerPage` | `string` | `"S1 M1 L1 XL1"` | Defines the number of items per page depending on the carousel width. - 'S' for screens smaller than 600 pixels. - 'M' f |
| `hideNavigationArrows` | `boolean` | `false` | Defines the visibility of the navigation arrows. If set to true the navigation arrows will be hidden. |
| `hidePageIndicator` | `boolean` | `false` | Defines the visibility of the page indicator. If set to true the page indicator will be hidden. |
| `pageIndicatorType` | `CarouselPageIndicatorType` | `"Default"` | Defines the style of the page indicator. Available options are: - Default - The page indicator will be visualized as dot |
| `backgroundDesign` | `BackgroundDesign` | `"Translucent"` | Defines the carousel's background design. |
| `pageIndicatorBackgroundDesign` | `BackgroundDesign` | `"Solid"` | Defines the page indicator background design. |
| `pageIndicatorBorderDesign` | `BorderDesign` | `"Solid"` | Defines the page indicator border design. |
| `arrowsPlacement` | `CarouselArrowsPlacement` | `"Content"` | Defines the position of arrows. Available options are: - Content - the arrows are placed on the sides of the current pag |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Navigate)` | ~~`(navigate)`~~ | Fired whenever the page changes due to user interaction, when the user clicks on the navigation arrows or while resizing |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the component. **Note:** Items with the hidden attribute will be automatically excluded from carousel navigation and page calcu |

## CSS Parts
| Name | Description |
|------|-------------|
| `content` | Used to style the content of the component |
