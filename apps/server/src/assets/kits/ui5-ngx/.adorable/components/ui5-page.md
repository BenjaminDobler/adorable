# Page

**Type:** Component
**Selector:** `<ui5-page>`
**Import:** `import { PageComponent } from '@ui5/webcomponents-ngx/fiori/page';`
**Export As:** `ui5Page`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-page [backgroundDesign]="..."></ui5-page>
```

## Description
The ui5-page is a container component that holds one whole screen of an application. The page has three distinct areas that can hold content - a header, content area and a footer. The top most area of the page is occupied by the header. The standard header includes a navigation button and a title. The content occupies the main part of the page. Only the content area is scrollable by default. This can be prevented by setting noScrolling to true. The footer is optional and occupies the part above the bottom part of the content. Alternatively, the footer can be fixed at the bottom of the page by 

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `backgroundDesign` | `PageBackgroundDesign` | `"Solid"` | Defines the background color of the ui5-page. **Note:** When a ui5-list is placed inside the page, we recommend using “L |
| `noScrolling` | `boolean` | `false` | Disables vertical scrolling of page content. If set to true, there will be no vertical scrolling at all. |
| `fixedFooter` | `boolean` | `false` | Defines if the footer is fixed at the very bottom of the page. **Note:** When set to true the footer is fixed at the ver |
| `hideFooter` | `boolean` | `false` | Defines the footer visibility. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content HTML Element. |
| `footer` | Defines the footer HTML Element. |
| `header` | Defines the header HTML Element. |

## CSS Parts
| Name | Description |
|------|-------------|
| `content` | Used to style the content section of the component |
