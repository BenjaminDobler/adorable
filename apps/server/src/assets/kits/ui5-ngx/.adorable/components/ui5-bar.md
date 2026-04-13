# Bar

**Type:** Component
**Selector:** `<ui5-bar>`
**Import:** `import { BarComponent } from '@ui5/webcomponents-ngx/main/bar';`
**Export As:** `ui5Bar`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-bar [design]="..."></ui5-bar>
```

## Description
The Bar is a container which is primarily used to hold titles, buttons and input elements and its design and functionality is the basis for page headers and footers. The component consists of three areas to hold its content - startContent slot, default slot and endContent slot. It has the capability to center content, such as a title, while having other components on the left and right side. With the use of the design property, you can set the style of the Bar to appear designed like a Header, Subheader, Footer and FloatingFooter. **Note:** Do not place a Bar inside another Bar or inside any b

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `design` | `BarDesign` | `"Header"` | Defines the component's design. |
| `accessibleRole` | `BarAccessibleRole` | `"Toolbar"` | Specifies the ARIA role applied to the component for accessibility purposes. **Note:** - Set accessibleRole to "toolbar" |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the bar. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content in the middle of the bar. |
| `endContent` | Defines the content at the end of the bar. |
| `startContent` | Defines the content at the start of the bar. |

## CSS Parts
| Name | Description |
|------|-------------|
| `bar` | Used to style the wrapper of the content of the component |
| `endContent` | Used to style the wrapper of the end content of the component |
| `midContent` | Used to style the wrapper of the middle content of the component |
| `startContent` | Used to style the wrapper of the start content of the component |
