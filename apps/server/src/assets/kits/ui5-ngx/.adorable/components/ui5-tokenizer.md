# Tokenizer

**Type:** Component
**Selector:** `<ui5-tokenizer>`
**Import:** `import { TokenizerComponent } from '@ui5/webcomponents-ngx/main/tokenizer';`
**Export As:** `ui5Tokenizer`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-tokenizer [readonly]="..." (ui5TokenDelete)="onTokenDelete($event)"></ui5-tokenizer>
```

## Description
A ui5-tokenizer is an invisible container for ui5-tokens that supports keyboard navigation and token selection. The ui5-tokenizer consists of two parts: - Tokens - displays the available tokens. - N-more indicator - contains the number of the remaining tokens that cannot be displayed due to the limited space. The ui5-tokenizer provides advanced keyboard handling. When a token is focused the user can use the following keyboard shortcuts in order to perform a navigation: - [Left] or [Right] / [Up] or [Down] - Navigates left and right through the tokens. - [Home] - Navigates to the first token. -

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `readonly` | `boolean` | `false` | Defines whether the component is read-only. **Note:** A read-only component is not editable, but still provides visual f |
| `multiLine` | `boolean` | `false` | Defines whether tokens are displayed on multiple lines. **Note:** The multiLine property is in an experimental state and |
| `name` | `string | undefined` | `undefined` | Determines the name by which the component will be identified upon submission in an HTML form. **Note:** This property i |
| `showClearAll` | `boolean` | `false` | Defines whether "Clear All" button is present. Ensure multiLine is enabled, otherwise showClearAll will have no effect.  |
| `disabled` | `boolean` | `false` | Defines whether the component is disabled. **Note:** A disabled component is completely noninteractive. |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the component. |
| `accessibleNameRef` | `string | undefined` | `undefined` | Receives id(or many ids) of the elements that label the component. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Outputs (Events)
| Angular Output (use this) | DOM Event (don't use) | Description |
|--------------------------|----------------------|-------------|
| `(ui5TokenDelete)` | ~~`(token-delete)`~~ | Fired when tokens are being deleted (delete icon, delete or backspace is pressed) |
| `(ui5SelectionChange)` | ~~`(selection-change)`~~ | Fired when token selection is changed by user interaction |

> **IMPORTANT:** Always use the Angular output name (left column). Raw DOM event names will not trigger Angular change detection correctly with the ngx wrapper.

> **Event payload:** The ngx wrapper emits the `detail` object directly from the EventEmitter — access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already unwrapped for you.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the tokens to be displayed. |
