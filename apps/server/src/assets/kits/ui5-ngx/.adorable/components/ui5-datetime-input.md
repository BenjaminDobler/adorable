# DateTimeInput

**Type:** Web Component (no Angular wrapper available)
**Selector:** `<ui5-datetime-input>`
> **Warning:** This component has no `@ui5/webcomponents-ngx` wrapper. Consider using an alternative or check if a wrapper has been added in a newer version.
**Package:** `@ui5/webcomponents` (main)

## Description
Extention of the UI5 Input, so we do not modify Input's private properties within the datetime components. Intended to be used for the DateTime components.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the suggestion items. **Note:** The suggestions would be displayed only if the showSuggestions property is set to true. **Note:** The <ui5-sug |
| `icon` | Defines the icon to be displayed in the component. |
| `valueStateMessage` | Defines the value state message that will be displayed as pop up under the component. The value state message slot should contain only one root elemen |

## CSS Parts
| Name | Description |
|------|-------------|
| `clear-icon` | Used to style the clear icon, which can be pressed to clear user input text |
| `input` | Used to style the native input element |
| `root` | Used to style the root DOM element of the Input component |
