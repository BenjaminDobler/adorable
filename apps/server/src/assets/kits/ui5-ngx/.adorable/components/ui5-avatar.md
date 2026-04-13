# Avatar

**Type:** Component
**Selector:** `<ui5-avatar>`
**Import:** `import { AvatarComponent } from '@ui5/webcomponents-ngx/main/avatar';`
**Export As:** `ui5Avatar`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-avatar [disabled]="..." (ui5Click)="onClick($event)"></ui5-avatar>
```

## Description
An image-like component that has different display options for representing images and icons in different shapes and sizes, depending on the use case. The shape can be circular or square. There are several predefined sizes, as well as an option to set a custom size. - [Space] / [Enter] or [Return] - Fires the click event if the mode is set to Interactive or the deprecated interactive property is set to true. - [Shift] - If [Space] is pressed, pressing [Shift] releases the component without triggering the click event. import "@ui5/webcomponents/dist/Avatar.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. A disabled component can't be pressed or focused, and it is not in the tab ch |
| `interactive` | `boolean` | `false` | Defines if the avatar is interactive (focusable and pressable). **Note:** When set to true, this property takes preceden |
| `icon` | `string | undefined` | `undefined` | Defines the name of the UI5 Icon, that will be displayed. **Note:** If image slot is provided, the property will be igno |
| `fallbackIcon` | `string` | `"employee"` | Defines the name of the fallback icon, which should be displayed in the following cases: - If the initials are not valid |
| `initials` | `string | undefined` | `undefined` | Defines the displayed initials. Up to three Latin letters can be displayed as initials. |
| `shape` | `AvatarShape` | `"Circle"` | Defines the shape of the component. |
| `size` | `AvatarSize` | `"S"` | Defines predefined size of the component. |
| `colorScheme` | `AvatarColorScheme` | `"Auto"` | Defines the background color of the desired image. If colorScheme is set to Auto, the avatar will be displayed with the  |
| `accessibleName` | `string | undefined` | `undefined` | Defines the text alternative of the component. If not provided a default text alternative will be set, if present. |
| `accessibilityAttributes` | `AvatarAccessibilityAttributes` | `{}` | Defines the additional accessibility attributes that will be applied to the component. The following field is supported: |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Click)` | ~~`(click)`~~ | Fired on mouseup, space and enter if avatar is interactive **Note:** The event will not be fired if the disabled propert |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `badge` | Defines the optional badge that will be used for visual affordance. **Recommendation:** While badges are supported on all avatars, it is recommended t |
| `default` | Receives the desired <img> tag **Note:** If you experience flickering of the provided image, you can hide the component until it is defined with the f |

## Related Horizon Theme Variables
- `--sapAvatar_1_Background` = #fff3b8
- `--sapAvatar_1_BorderColor` = #fff3b8
- `--sapAvatar_1_TextColor` = #a45d00
- `--sapAvatar_1_Hover_Background` = #fff3b8
- `--sapAvatar_2_Background` = #ffd0e7
- `--sapAvatar_2_BorderColor` = #ffd0e7
- `--sapAvatar_2_TextColor` = #aa0808
- `--sapAvatar_2_Hover_Background` = #ffd0e7
- `--sapAvatar_3_Background` = #ffdbe7
- `--sapAvatar_3_BorderColor` = #ffdbe7
- `--sapAvatar_3_TextColor` = #ba066c
- `--sapAvatar_3_Hover_Background` = #ffdbe7
- `--sapAvatar_4_Background` = #ffdcf3
- `--sapAvatar_4_BorderColor` = #ffdcf3
- `--sapAvatar_4_TextColor` = #a100c2
- ...and 28 more
