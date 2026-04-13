# SearchScope

**Type:** Component
**Selector:** `<ui5-search-scope>`
**Import:** `import { SearchScopeComponent } from '@ui5/webcomponents-ngx/fiori/search-scope';`
**Export As:** `ui5SearchScope`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-search-scope [text]="..."></ui5-search-scope>
```

## Description
The ui5-search-scope represents the options for the scope in ui5-search.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | `""` | Defines the text of the component. |
| `value` | `string | undefined` | `undefined` | Defines the value of the ui5-search-scope. Used for selection in Search scopes. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.
