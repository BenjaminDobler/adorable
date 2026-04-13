# Card

**Type:** Component
**Selector:** `<ui5-card>`
**Import:** `import { CardComponent } from '@ui5/webcomponents-ngx/main/card';`
**Export As:** `ui5Card`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-card [accessibleName]="..."></ui5-card>
```

## Description
The ui5-card is a component that represents information in the form of a tile with separate header and content areas. The content area of a ui5-card can be arbitrary HTML content. The header can be used through slot header. For which there is a ui5-card-header component to achieve the card look and feel. Note: We recommend the usage of ui5-card-header for the header slot, so advantage can be taken for keyboard handling, styling and accessibility. import "@ui5/webcomponents/dist/Card.js"; import "@ui5/webcomponents/dist/CardHeader.js"; (for ui5-card-header)

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible name of the component, which is used as the name of the card region and should be unique per card |
| `accessibleNameRef` | `string | undefined` | `undefined` | Defines the IDs of the elements that label the component. |
| `loading` | `boolean` | `false` | Defines if a loading indicator would be displayed over the card. |
| `loadingDelay` | `number` | `1000` | Defines the delay in milliseconds, after which the loading indicator will show up for this card. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the component. |
| `header` | Defines the header of the component. **Note:** Use ui5-card-header for the intended design. |

## CSS Parts
| Name | Description |
|------|-------------|
| `content` | Used to style the content of the card |
| `root` | Used to style the root DOM element of the card component |
