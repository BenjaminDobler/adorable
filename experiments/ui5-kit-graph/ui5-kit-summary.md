# UI5 Web Components Kit (Angular / @ui5/webcomponents-ngx) — Horizon theme

UI5 version: `2.21.0` · ngx wrappers joined: 159 · generated 2026-04-13T21:22:47.230Z

**182 components** indexed, **1476** Horizon theme variables captured.

## MANDATORY usage pattern — read before writing any UI5 code

This kit targets the **`@ui5/webcomponents-ngx` Angular wrappers**, NOT the raw web components. Follow this pattern exactly:

### ✅ Do this

```ts
import { Component, signal } from '@angular/core';
// Import the Angular wrapper COMPONENT CLASSES, not the raw dist files:
import { ButtonComponent } from '@ui5/webcomponents-ngx/main/button';
import { ListComponent } from '@ui5/webcomponents-ngx/main/list';
import { ListItemStandardComponent } from '@ui5/webcomponents-ngx/main/list-item-standard';
import { ShellBarComponent } from '@ui5/webcomponents-ngx/fiori/shell-bar';
// Theme setup — call ONCE per app, at module load:
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';
setTheme('sap_horizon'); // or 'sap_horizon_dark', 'sap_horizon_hcb', etc.

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [ButtonComponent, ListComponent, ListItemStandardComponent, ShellBarComponent],
  // NO schemas — the ngx wrappers are real Angular components
  template: \`
    <ui5-shellbar [primaryTitle]="'Products'" (ui5ProfileClick)="onProfileClick()" />
    <ui5-list [selectionMode]="'Single'" (ui5SelectionChange)="onSelect($event)">
      @for (p of products(); track p.id) {
        <ui5-li [description]="p.category">{{ p.name }}</ui5-li>
      }
    </ui5-list>
    <ui5-button [design]="'Emphasized'" (ui5Click)="save()">Save</ui5-button>
  \`,
})
export class ProductsComponent { /* ... */ }
```

### ❌ Do NOT do these things

1. **DO NOT use `CUSTOM_ELEMENTS_SCHEMA`.** The ngx wrappers are real Angular components, not custom elements. Using the schema means you imported the wrong thing.
2. **DO NOT use `[attr.xxx]="..."` bindings.** The wrappers expose real Angular `@Input()`s — write `[design]="..."`, not `[attr.design]="..."`. If the binding requires `[attr.]`, you are using a property that doesn't exist in the wrapper.
3. **DO NOT bind raw DOM event names.** UI5 events are renamed as Angular outputs with a `ui5` prefix: `click` → `ui5Click`, `selection-change` → `ui5SelectionChange`, `item-click` → `ui5ItemClick`. Always use `(ui5Xxx)`, never `(click)` or `(selection-change)` on a ui5 element.
4. **DO NOT import from `@ui5/webcomponents/dist/*`.** That's the raw custom-element side. Import Angular wrapper classes from `@ui5/webcomponents-ngx/main/{component}` or `@ui5/webcomponents-ngx/fiori/{component}` — each component has its own subpath (e.g. `@ui5/webcomponents-ngx/main/button`, `@ui5/webcomponents-ngx/fiori/shell-bar`). Check each component's doc for the exact import path.
5. **DO NOT use kebab-case attribute bindings** like `title-text="..."` or `[attr.subtitle-text]="..."`. Use camelCase inputs: `[titleText]="..."`, `[subtitleText]="..."`.
6. **Event payloads are unwrapped.** The ngx wrappers emit the `detail` object directly from the EventEmitter. Access properties on the event itself (e.g. `event.selectedItems`), NOT via `event.detail.selectedItems`. The `.detail` wrapper is already removed for you.

### Example — events renamed

| Component | DOM event | Angular output (use this) |
|---|---|---|
| `<ui5-button>` | `click` | `(ui5Click)` |
| `<ui5-list>` | `selection-change` | `(ui5SelectionChange)` |
| `<ui5-list>` | `item-click` | `(ui5ItemClick)` |
| `<ui5-side-navigation>` | `selection-change` | `(ui5SelectionChange)` |
| `<ui5-shellbar>` | `profile-click` | `(ui5ProfileClick)` |
| `<ui5-shellbar>` | `notifications-click` | `(ui5NotificationsClick)` |
| `<ui5-tabcontainer>` | `tab-select` | `(ui5TabSelect)` |

For any component you use, call `query_kit("<ui5-tag>")` to see the exact list of Angular inputs, ngx-renamed outputs, import module, and the component class name to import.

### Module mapping

- Components from `@ui5/webcomponents` → import from **`@ui5/webcomponents-ngx/main/{component}`** (e.g. `/main/button`, `/main/list`)
- Components from `@ui5/webcomponents-fiori` → import from **`@ui5/webcomponents-ngx/fiori/{component}`** (e.g. `/fiori/shell-bar`, `/fiori/illustrated-message`)

## Theming (Horizon)

Horizon is the default modern SAP theme. Set it explicitly:

```ts
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';
setTheme('sap_horizon');
```

Customise via CSS variables (on `:root` or any ancestor). Top theme variable categories:

- **Chart** — 482 variables
- **Button** — 172 variables
- **IndicationColor** — 160 variables
- **Content** — 115 variables
- **Shell** — 111 variables
- **Field** — 66 variables
- **Avatar** — 43 variables
- **Legend** — 43 variables
- **Tab** — 32 variables
- **Progress** — 31 variables
- **List** — 26 variables
- **Accent** — 20 variables
- **Assistant** — 18 variables
- **Font** — 16 variables
- **Slider** — 14 variables
- **Tile** — 14 variables
- **Group** — 10 variables
- **Link** — 9 variables
- **Element** — 8 variables
- **ObjectHeader** — 8 variables

All theme variables are named `--sap*` and are semantic, not physical (prefer `--sapBrandColor` over hardcoded hex values).

## God-node components (most connected)

These are the components with the richest API surfaces. Use them as anchors when composing layouts.

- `<ui5-button>` (main) — 195 connections — The ui5-button component represents a simple push button.
- `<ui5-avatar>` (main) — 59 connections — An image-like component that has different display options for representing images and icons in different shapes and sizes, depending on the use case.
- `<ui5-list>` (main) — 58 connections — The ui5-list component allows displaying a list of items, advanced keyboard handling support for navigating between items, and predefined modes to improve the development efficiency.
- `<ui5-tab>` (main) — 43 connections — The ui5-tab represents a selectable item inside a ui5-tabcontainer.
- `<ui5-daterange-picker>` (main) — 37 connections — The DateRangePicker enables the users to enter a localized date range using touch, mouse, keyboard input, or by selecting a date range in the calendar.
- `<ui5-multi-input>` (main) — 36 connections — A ui5-multi-input field allows the user to enter multiple values, which are displayed as ui5-token.
- `<ui5-shellbar>` (fiori) — 35 connections — The ui5-shellbar is meant to serve as an application header and includes numerous built-in features, such as: logo, profile image/icon, title, search field, notifications and so on.
- `<ui5-calendar>` (main) — 34 connections — The ui5-calendar component allows users to select one or more dates.
- `<ui5-date-picker>` (main) — 33 connections — The ui5-date-picker component provides an input field with assigned calendar which opens on user action.
- `<ui5-datetime-picker>` (main) — 33 connections — The DateTimePicker component alows users to select both date (day, month and year) and time (hours, minutes and seconds) and for the purpose it consists of input field and Date/Time picker.
- `<ui5-li-suggestion-item>` (main) — 33 connections — The ui5-li-suggestion-item represents the suggestion item in the ui5-input suggestion popover.
- `<ui5-datetime-input>` (main) — 32 connections — Extention of the UI5 Input, so we do not modify Input's private properties within the datetime components.
- `<ui5-input>` (main) — 32 connections — The ui5-input component allows the user to enter and edit text or numeric values in one line.
- `<ui5-slider>` (main) — 32 connections — The Slider component represents a numerical range and a handle (grip).
- `<ui5-notification-group-list>` (fiori) — 32 connections — Internal ui5-li-notification-group-list component, that is used to support keyboard navigation of the notification group internal list.

## Component index by package

### @ui5/webcomponents (121)

`ui5-avatar-badge`, `ui5-avatar-group`, `ui5-avatar`, `ui5-bar`, `ui5-breadcrumbs-item`, `ui5-breadcrumbs`, `ui5-busy-indicator`, `ui5-button-badge`, `ui5-button`, `ui5-calendar-legend-item`, `ui5-calendar-legend`, `ui5-calendar`, `ui5-card-header`, `ui5-card`, `ui5-carousel`, `ui5-cb-item-group`, `ui5-cb-item`, `ui5-checkbox`, `ui5-color-palette-item`, `ui5-color-palette-popover`, `ui5-color-palette`, `ui5-color-picker`, `ui5-combobox`, `ui5-date-picker`, `ui5-date-range`, `ui5-date`, `ui5-daterange-picker`, `ui5-datetime-input`, `ui5-datetime-picker`, `ui5-daypicker`, `ui5-dialog`, `ui5-drop-indicator`, `ui5-dynamic-date-range`, `ui5-expandable-text`, `ui5-file-uploader`, `ui5-form-group`, `ui5-form-item`, `ui5-form`, `ui5-icon`, `ui5-input`, `ui5-label`, `ui5-li-custom`, `ui5-li-group-header`, `ui5-li-group`, `ui5-li-suggestion-item`, `ui5-li`, `ui5-link`, `ui5-list`, `ui5-mcb-item-group`, `ui5-mcb-item`, `ui5-menu-item-group`, `ui5-menu-item`, `ui5-menu-separator`, `ui5-menu`, `ui5-message-strip`, `ui5-monthpicker`, `ui5-multi-combobox`, `ui5-multi-input`, `ui5-option-custom`, `ui5-option`, `ui5-panel`, `ui5-popover`, `ui5-progress-indicator`, `ui5-radio-button`, `ui5-range-slider`, `ui5-rating-indicator`, `ui5-responsive-popover`, `ui5-segmented-button-item`, `ui5-segmented-button`, `ui5-select`, `ui5-slider-handle`, `ui5-slider-tooltip`, `ui5-slider`, `ui5-special-date`, `ui5-split-button`, `ui5-step-input`, `ui5-suggestion-item-custom`, `ui5-suggestion-item-group`, `ui5-suggestion-item`, `ui5-switch`, `ui5-tab-separator`, `ui5-tab`, `ui5-tabcontainer`, `ui5-table-cell`, `ui5-table-growing`, `ui5-table-header-cell-action-ai`, `ui5-table-header-cell`, `ui5-table-header-row`, `ui5-table-row-action-navigation`, `ui5-table-row-action`, `ui5-table-row`, `ui5-table-selection-multi`, `ui5-table-selection-single`, `ui5-table-selection`, `ui5-table-virtualizer`, `ui5-table`, `ui5-tag`, `ui5-text`, `ui5-textarea`, `ui5-time-picker-clock`, `ui5-time-picker`, `ui5-time-selection-clocks`, `ui5-time-selection-inputs`, `ui5-title`, `ui5-toast`, `ui5-toggle-button`, `ui5-toggle-spin-button`, `ui5-token`, `ui5-tokenizer`, `ui5-toolbar-button`, `ui5-toolbar-item`, `ui5-toolbar-select-option`, `ui5-toolbar-select`, `ui5-toolbar-separator`, `ui5-toolbar-spacer`, `ui5-toolbar`, `ui5-tree-item-custom`, `ui5-tree-item`, `ui5-tree`, `ui5-yearpicker`, `ui5-yearrangepicker`

### @ui5/webcomponents-fiori (61)

`ui5-barcode-scanner-dialog`, `ui5-dynamic-page-header-actions`, `ui5-dynamic-page-header`, `ui5-dynamic-page-title`, `ui5-dynamic-page`, `ui5-dynamic-side-content`, `ui5-filter-item-option`, `ui5-filter-item`, `ui5-flexible-column-layout`, `ui5-group-item`, `ui5-illustrated-message`, `ui5-li-notification-group`, `ui5-li-notification`, `ui5-media-gallery-item`, `ui5-media-gallery`, `ui5-navigation-layout`, `ui5-navigation-menu-item`, `ui5-navigation-menu`, `ui5-notification-group-list`, `ui5-notification-list-internal`, `ui5-notification-list`, `ui5-page`, `ui5-product-switch-item`, `ui5-product-switch`, `ui5-search-field`, `ui5-search-item-group`, `ui5-search-item-show-more`, `ui5-search-item`, `ui5-search-message-area`, `ui5-search-scope`, `ui5-search`, `ui5-shellbar-branding`, `ui5-shellbar-item`, `ui5-shellbar-search`, `ui5-shellbar-spacer`, `ui5-shellbar`, `ui5-side-navigation-group`, `ui5-side-navigation-item`, `ui5-side-navigation-sub-item`, `ui5-side-navigation`, `ui5-sort-item`, `ui5-timeline-group-item`, `ui5-timeline-item`, `ui5-timeline`, `ui5-upload-collection-item`, `ui5-upload-collection`, `ui5-user-menu-account`, `ui5-user-menu-item-group`, `ui5-user-menu-item`, `ui5-user-menu`, `ui5-user-settings-account-view`, `ui5-user-settings-appearance-view-group`, `ui5-user-settings-appearance-view-item`, `ui5-user-settings-appearance-view`, `ui5-user-settings-dialog`, `ui5-user-settings-item`, `ui5-user-settings-view`, `ui5-view-settings-dialog`, `ui5-wizard-step`, `ui5-wizard-tab`, `ui5-wizard`


## Graph query tool

For detailed API info on any component (slots, properties, events, CSS parts, theme variables) use `query_kit("ui5", "<ui5-tagName>")`. Prefer this over reading source files.
