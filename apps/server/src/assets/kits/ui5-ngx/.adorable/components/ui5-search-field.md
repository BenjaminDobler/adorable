# SearchField

**Type:** Web Component (no Angular wrapper available)
**Selector:** `<ui5-search-field>`
> **Warning:** This component has no `@ui5/webcomponents-ngx` wrapper. Consider using an alternative or check if a wrapper has been added in a newer version.
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Description
A ui5-search-field is an input field, used for user search. The ui5-search-field consists of several elements parts: - Scope - displays a select in the beggining of the component, used for filtering results by their scope. - Input field - for user input value - Clear button - gives the possibility for deleting the entered value - Search button - a primary button for performing search, when the user has entered a search term import "@ui5/webcomponents-fiori/dist/SearchField.js";

## Slots
| Name | Description |
|------|-------------|
| `filterButton` | Defines the filter button slot, used to display an additional filtering button. This slot is intended for passing a ui5-button with a filter icon to p |
| `scopes` | Defines the component scope options. |
