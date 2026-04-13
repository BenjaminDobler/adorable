# DynamicPageTitle

**Type:** Component
**Selector:** `<ui5-dynamic-page-title>`
**Import:** `import { DynamicPageTitleComponent } from '@ui5/webcomponents-ngx/fiori/dynamic-page-title';`
**Export As:** `ui5DynamicPageTitle`
**Package:** `@ui5/webcomponents-fiori` (fiori)

## Basic Usage
```html
<ui5-dynamic-page-title></ui5-dynamic-page-title>
```

## Description
Title of the DynamicPage. The DynamicPageTitle component is part of the DynamicPage family and is used to serve as title of the DynamicPage. The DynamicPageTitle can hold any component and displays the most important information regarding the object that will always remain visible while scrolling. **Note:** The actions slot accepts any UI5 web component, but it's recommended to use ui5-toolbar. The user can switch between the expanded/collapsed states of the DynamicPage by clicking on the DynamicPageTitle or by using the expand/collapse visual indicators, positioned at the bottom of the Dynami

## Slots
| Name | Description |
|------|-------------|
| `actionsBar` | Defines the bar with actions in the Dynamic page title. |
| `breadcrumbs` | Defines the content of the breadcrumbs inside Dynamic Page Title. |
| `default` | Defines the content of the Dynamic page title. |
| `heading` | Defines the content of the Heading of the Dynamic Page. The font size of the title within the heading slot can be adjusted to the recommended values u |
| `navigationBar` | Defines the bar with navigation actions in the Dynamic page title. |
| `snappedHeading` | Defines the heading that is shown only when the header is snapped. |
| `snappedSubheading` | Defines the content of the title that is shown only when the header is snapped. |
| `snappedTitleOnMobile` | Defines the content of the snapped title on mobile devices. This slot is displayed only when the DynamicPageTitle is in the snapped state on mobile de |
| `subheading` | Defines the content of the title that is shown only when the header is not snapped. |
