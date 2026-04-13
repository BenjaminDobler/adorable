# SegmentedButtonItem

**Type:** Component
**Selector:** `<ui5-segmented-button-item>`
**Import:** `import { SegmentedButtonItemComponent } from '@ui5/webcomponents-ngx/main/segmented-button-item';`
**Export As:** `ui5SegmentedButtonItem`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-segmented-button-item [disabled]="..."></ui5-segmented-button-item>
```

## Description
Users can use the ui5-segmented-button-item as part of a ui5-segmented-button. Clicking or tapping on a ui5-segmented-button-item changes its state to selected. The item returns to its initial state when the user clicks or taps on it again. By applying additional custom CSS-styling classes, apps can give a different style to any ui5-segmented-button-item. import "@ui5/webcomponents/dist/SegmentedButtonItem.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. A disabled component can't be selected or focused, and it is not in the tab c |
| `selected` | `boolean` | `false` | Determines whether the component is displayed as selected. |
| `tooltip` | `string | undefined` | `undefined` | Defines the tooltip of the component. **Note:** A tooltip attribute should be provided for icon-only buttons, in order t |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible description of the component. |
| `accessibleDescriptionRef` | `string | undefined` | `undefined` | Defines the IDs of the HTML Elements that describe the component. |
| `icon` | `string | undefined` | `undefined` | Defines the icon, displayed as graphical element within the component. The SAP-icons font provides numerous options. Exa |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |
