# Tab

**Type:** Component
**Selector:** `<ui5-tab>`
**Import:** `import { TabComponent } from '@ui5/webcomponents-ngx/main/tab';`
**Export As:** `ui5Tab`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-tab [text]="..."></ui5-tab>
```

## Description
The ui5-tab represents a selectable item inside a ui5-tabcontainer. It defines both the item in the tab strip (top part of the ui5-tabcontainer) and the content that is presented to the user once the tab is selected.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string | undefined` | `undefined` | The text to be displayed for the item. |
| `disabled` | `boolean` | `false` | Disabled tabs can't be selected. |
| `additionalText` | `string | undefined` | `undefined` | Represents the "additionalText" text, which is displayed in the tab. In the cases when in the same time there are tabs w |
| `icon` | `string | undefined` | `undefined` | Defines the icon source URI to be displayed as graphical element within the component. The SAP-icons font provides numer |
| `design` | `SemanticColor` | `"Default"` | Defines the component's design color. The design is applied to: - the component icon - the text when the component overf |
| `selected` | `boolean` | `false` | Specifies if the component is selected. |
| `movable` | `boolean` | `false` | Defines if the tab is movable. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Holds the content associated with this tab. |
| `items` | Defines hierarchies with nested sub tabs. **Note:** Use ui5-tab and ui5-tab-separator for the intended design. |

## Related Horizon Theme Variables
- `--sapTab_TextColor` = #131e29
- `--sapTab_ForegroundColor` = #0064d9
- `--sapTab_IconColor` = #0064d9
- `--sapTab_Background` = #fff
- `--sapTab_Selected_TextColor` = #0064d9
- `--sapTab_Selected_IconColor` = #fff
- `--sapTab_Selected_Background` = #0064d9
- `--sapTab_Selected_Indicator_Dimension` = .1875rem
- `--sapTab_Positive_TextColor` = #256f3a
- `--sapTab_Positive_ForegroundColor` = #30914c
- `--sapTab_Positive_IconColor` = #30914c
- `--sapTab_Positive_Selected_TextColor` = #256f3a
- `--sapTab_Positive_Selected_IconColor` = #fff
- `--sapTab_Positive_Selected_Background` = #30914c
- `--sapTab_Negative_TextColor` = #aa0808
- ...and 17 more
