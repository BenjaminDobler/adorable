# BreadcrumbsItem

**Type:** Component
**Selector:** `<ui5-breadcrumbs-item>`
**Import:** `import { BreadcrumbsItemComponent } from '@ui5/webcomponents-ngx/main/breadcrumbs-item';`
**Export As:** `ui5BreadcrumbsItem`
**Package:** `@ui5/webcomponents` (main)

## Basic Usage
```html
<ui5-breadcrumbs-item [href]="..."></ui5-breadcrumbs-item>
```

## Description
The ui5-breadcrumbs-item component defines the content of an item in ui5-breadcrumbs.

## Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `href` | `string | undefined` | `undefined` | Defines the link href. **Note:** Standard hyperlink behavior is supported. |
| `target` | `string | undefined` | `undefined` | Defines the link target. Available options are: - _self - _top - _blank - _parent - _search **Note:** This property must |
| `accessibleName` | `string | undefined` | `undefined` | Defines the accessible ARIA name of the item. |

> **IMPORTANT:** Use property bindings `[inputName]="value"`. Do NOT use `[attr.inputName]` — the ngx wrapper provides real Angular @Input()s.

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the text of the component. **Note:** Although this slot accepts HTML Elements, it is strongly recommended that you only use text in order to p |
