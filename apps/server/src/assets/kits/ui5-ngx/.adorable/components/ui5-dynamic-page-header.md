# DynamicPageHeader

**Type:** Component
**Selector:** `<ui5-dynamic-page-header>`
**Import:** `import { DynamicPageHeaderComponent } from '@ui5/webcomponents-ngx/fiori/dynamic-page-header';`
**Export As:** `ui5DynamicPageHeader`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-dynamic-page-header></ui5-dynamic-page-header>
```

## Description
Header of the DynamicPage. The DynamicPageHeader ui5-dynamic-page-header is part of the DynamicPage family and is used to serve as header of the DynamicPage. The DynamicPageHeader can hold any layout control and has two states - expanded and collapsed (snapped). The switching between these states happens when: - the user scrolls below its bottom margin - the user clicks on the DynamicPageTitle - through the DynamicPage property headerSnapped The responsive behavior of the DynamicPageHeader depends on the behavior of the content that is displayed. The DynamicPageHeader provides an accessible la

## Slots
| Name | Description |
|------|-------------|
| `default` | Defines the content of the Dynamic Page Header. |
