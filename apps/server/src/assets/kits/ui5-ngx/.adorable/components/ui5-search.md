# Search

**Type:** Component
**Selector:** `<ui5-search>`
**Import:** `import { SearchComponent } from '@ui5/webcomponents-ngx/fiori/search';`
**Export As:** `ui5Search`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-search [loading]="..." (ui5Open)="onOpen($event)"></ui5-search>
```

## Description
A ui5-search is an input with suggestions, used for user search. The ui5-search consists of several elements parts: - Scope - displays a select in the beggining of the component, used for filtering results by their scope. - Input field - for user input value - Clear button - gives the possibility for deleting the entered value - Search button - a primary button for performing search, when the user has entered a search term - Suggestions - a list with available search suggestions import "@ui5/webcomponents-fiori/dist/Search.js";

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `loading` | `boolean` | `false` | Indicates whether a loading indicator should be shown in the popup. |
| `noTypeahead` | `boolean` | `false` | Defines whether the value will be autcompleted to match an item. |
| `open` | `boolean` | `false` | Indicates whether the items picker is open. |
| `showClearIcon` | `boolean` | `false` | Defines whether the clear icon of the search will be shown. |
| `value` | `string` | `""` | Defines the value of the component. **Note:** The property is updated upon typing. |
| `placeholder` | `string | undefined` | `undefined` | Defines a short hint intended to aid the user with data entry when the component has no value. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleDescription` | `string | undefined` | `undefined` | Defines the accessible ARIA description of the field. |
| `scopeValue` | `string | undefined` | `""` | Defines the value of the component: Applications are responsible for setting the correct scope value. **Note:** If the g |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5Open)` | ~~`(open)`~~ | Fired when the popup is opened. |
| `(ui5Close)` | ~~`(close)`~~ | Fired when the popup is closed. |
| `(ui5Input)` | ~~`(input)`~~ | Fired when typing in input or clear icon is pressed. |
| `(ui5ScopeChange)` | ~~`(scope-change)`~~ | Fired when the scope has changed. |
| `(ui5Search)` | ~~`(search)`~~ | Fired when the user has triggered search with Enter key or Search Button press. |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `action` | Defines the popup footer action button. |
| `default` | Defines the Search suggestion items. |
| `filterButton` | Defines the filter button slot, used to display an additional filtering button. This slot is intended for passing a ui5-button with a filter icon to p |
| `illustration` | Defines the illustrated message to be shown in the popup. |
| `messageArea` | Defines the illustrated message to be shown in the popup. |
| `scopes` | Defines the component scope options. |
