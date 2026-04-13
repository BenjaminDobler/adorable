# SuggestionListItem

**Type:** Web Component (no Angular wrapper available)
**Selector:** `<ui5-li-suggestion-item>`
> **Warning:** This component has no `@ui5/webcomponents-ngx` wrapper. Consider using an alternative or check if a wrapper has been added in a newer version.
**Package:** `@ui5/webcomponents` (main)

## Description
The ui5-li-suggestion-item represents the suggestion item in the ui5-input suggestion popover.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the title text of the suggestion item. |
| `deleteButton` | Defines the delete button, displayed in "Delete" mode. **Note:** While the slot allows custom buttons, to match design guidelines, please use the ui5- |
| `image` | **Note:** While the slot allows option for setting custom avatar, to match the design guidelines, please use the ui5-avatar with it's default size - S |
| `richDescription` | Defines a description that can contain HTML. **Note:** If not specified, the description property will be used. |

## CSS Parts
| Name | Description |
|------|-------------|
| `additional-text` | Used to style the additionalText of the list item |
| `checkbox` | Used to style the checkbox rendered when the list item is in multiple selection mode |
| `content` | Used to style the content area of the list item |
| `delete-button` | Used to style the button rendered when the list item is in delete mode |
| `description` | Used to style the description of the suggestion list item |
| `detail-button` | Used to style the button rendered when the list item is of type detail |
| `icon` | Used to style the icon of the list item |
| `info` | Used to style the info of the suggestion list item |
| `native-li` | Used to style the main li tag of the list item |
| `radio` | Used to style the radio button rendered when the list item is in single selection mode |
| `title` | Used to style the title of the suggestion list item |
