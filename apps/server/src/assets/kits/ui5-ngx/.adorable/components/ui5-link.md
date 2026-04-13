# Link

**Type:** Component
**Selector:** `<ui5-link>`
**Import:** `import { LinkComponent } from '@ui5/webcomponents-ngx/main/link';`
**Export As:** `ui5Link`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-link [disabled]="..." (ui5Click)="onClick($event)"></ui5-link>
```

## Description
The ui5-link is a hyperlink component that is used to navigate to other apps and web pages, or to trigger actions. It is a clickable text element, visualized in such a way that it stands out from the standard text. On hover, it changes its style to an underlined text to provide additional feedback to the user. You can set the ui5-link to be enabled or disabled. To create a visual hierarchy in large lists of links, you can set the less important links as Subtle or the more important ones as Emphasized, by using the design property. If the href property is set, the link behaves as the HTML ancho

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. **Note:** When disabled, the click event cannot be triggered by the user. |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the component. |
| `href` | `string | undefined` | `undefined` | Defines the component href. **Note:** Standard hyperlink behavior is supported. |
| `target` | `string | undefined` | `undefined` | Defines the component target. **Notes:** - _self - _top - _blank - _parent - _search **This property must only be used w |
| `design` | `LinkDesign` | `"Default"` | Defines the component design. **Note:** Avaialble options are Default, Subtle, and Emphasized. |
| `interactiveAreaSize` | `InteractiveAreaSize` | `"Normal"` | Defines the target area size of the link: - **InteractiveAreaSize.Normal**: The default target area size. - **Interactiv |
| `wrappingType` | `WrappingType` | `"Normal"` | Defines how the text of a component will be displayed when there is not enough space. **Note:** By default the text will |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the input |
| `accessibleRole` | `LinkAccessibleRole` | `"Link"` | Defines the ARIA role of the component. **Note:** Use the <code>LinkAccessibleRole.Button</code> role in cases when navi |
| `accessibilityAttributes` | `LinkAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following fields are supporte |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `icon` | `string | undefined` | `undefined` | Defines the icon, displayed as graphical element within the component before the link's text. The SAP-icons font provide |
| `endIcon` | `string | undefined` | `undefined` | Defines the icon, displayed as graphical element within the component after the link's text. The SAP-icons font provides |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired when the component is triggered either with a mouse/tap or by using the Enter key. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |

## CSS Parts
| Name | Description |
|------|-------------|
| `endIcon` | Used to style the provided endIcon within the link |
| `icon` | Used to style the provided icon within the link |

## Related Horizon Theme Variables
- `--sapLinkColor` = #0064d9
- `--sapLink_TextDecoration` = none
- `--sapLink_Hover_Color` = #0064d9
- `--sapLink_Hover_TextDecoration` = underline
- `--sapLink_Active_Color` = #0064d9
- `--sapLink_Active_TextDecoration` = none
- `--sapLink_Visited_Color` = #0064d9
- `--sapLink_InvertedColor` = #a6cfff
- `--sapLink_SubtleColor` = #131e29
