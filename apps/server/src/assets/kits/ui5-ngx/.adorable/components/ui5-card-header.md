# CardHeader

**Type:** Component
**Selector:** `<ui5-card-header>`
**Import:** `import { CardHeaderComponent } from '@ui5/webcomponents-ngx/main/card-header';`
**Export As:** `ui5CardHeader`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-card-header [titleText]="..." (ui5Click)="onClick($event)"></ui5-card-header>
```

## Description
The ui5-card-header is a component, meant to be used as a header of the ui5-card component. It displays valuable information, that can be defined with several properties, such as: titleText, subtitleText, additionalText and two slots: avatar and action. In case you enable interactive property, you can press the ui5-card-header by Space and Enter keys. import "@ui5/webcomponents/dist/CardHeader";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `titleText` | `string | undefined` | `undefined` | Defines the title text. |
| `subtitleText` | `string | undefined` | `undefined` | Defines the subtitle text. |
| `additionalText` | `string | undefined` | `undefined` | Defines the additional text. |
| `interactive` | `boolean` | `false` | Defines if the component would be interactive, e.g gets hover effect and click event is fired, when pressed. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the component is activated by mouse/tap or by using the Enter or Space key. **Note:** The event would be fire |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `action` | Defines an action, displayed in the right most part of the header. |
| `avatar` | Defines an avatar image, displayed in the left most part of the header. |

## CSS Parts
| Name | Description |
|------|-------------|
| `additional-text` | Used to style the additional text of the CardHeader |
| `root` | Used to style the root DOM element of the CardHeader |
| `subtitle` | Used to style the subtitle of the CardHeader |
| `title` | Used to style the title of the CardHeader |
