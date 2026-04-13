# Switch

**Type:** Component
**Selector:** `<ui5-switch>`
**Import:** `import { SwitchComponent } from '@ui5/webcomponents-ngx/main/switch';`
**Export As:** `ui5Switch`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-switch [design]="..." (ui5Change)="onChange($event)"></ui5-switch>
```

## Description
The ui5-switch component is used for changing between binary states. The component can display texts, that will be switched, based on the component state, via the textOn and textOff properties, but texts longer than 3 letters will be cutted off. However, users are able to customize the width of ui5-switch with pure CSS (<ui5-switch style="width: 200px">), and set widths, depending on the texts they would use. Note: the component would not automatically stretch to fit the whole text width. The state can be changed by pressing the Space and Enter keys. import "@ui5/webcomponents/dist/Switch";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `design` | `SwitchDesign` | `"Textual"` | Defines the component design. **Note:** If Graphical type is set, positive and negative icons will replace the textOn an |
| `checked` | `boolean` | `false` | Defines if the component is checked. **Note:** The property can be changed with user interaction, either by clicking the |
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. **Note:** A disabled component is noninteractive. |
| `textOn` | `string | undefined` | `undefined` | Defines the text, displayed when the component is checked. **Note:** We recommend using short texts, up to 3 letters (la |
| `textOff` | `string | undefined` | `undefined` | Defines the text, displayed when the component is not checked. **Note:** We recommend using short texts, up to 3 letters |
| `accessibleName` | `string | undefined` | `undefined` | Sets the accessible ARIA name of the component. **Note**: We recommend that you set an accessibleNameRef pointing to an  |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component. **Note**: We recommend that you set an accessibleName |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the component. **Note:** If applicable an external label reference should always be the preferred |
| `required` | `boolean` | `false` | Defines whether the component is required. |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `value` | `string` | `""` | Defines the form value of the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Change)` | ~~`(change)`~~ | Fired when the component checked state changes. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## CSS Parts
| Name | Description |
|------|-------------|
| `handle` | Used to style the handle of the switch |
| `slider` | Used to style the track, where the handle is being slid |
| `text-off` | Used to style the textOff property text |
| `text-on` | Used to style the textOn property text |
