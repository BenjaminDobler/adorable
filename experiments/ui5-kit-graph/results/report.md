# UI5 Kit Graph — Comparison Report

Generated: 2026-04-10T23:13:19.298Z
Model: `claude-sonnet-4-6`

## Test prompt

```
Build me a single Angular standalone component called `ProductListPage` that uses UI5 Web Components with the SAP Horizon theme.

Layout:
- A `ui5-shellbar` header at the top showing the title "Product Catalog", with a search field, a notifications icon, and a profile avatar.
- A two-column body below the shellbar:
  - LEFT (60%): a `ui5-list` of 8 sample products (id, name, price, category). Items should be selectable single-select. When the user selects an item, the right panel updates.
  - RIGHT (40%): a `ui5-card` showing the selected product's details, with a header containing the product name and a `ui5-button` "Add to cart" with design "Emphasized" inside the card body.
- Use Horizon CSS variables for theming (background, spacing).

Output a complete, standalone Angular component (TypeScript + inline template + inline styles) named `ProductListPage` in `src/app/product-list-page.component.ts`. Also write a one-line `src/app/sample-products.ts` exporting the sample data.

Do not write tests. Do not write a module file. Do not call read_files unless you actually need to read something — there is nothing to read in this empty workspace.
```

## Metrics

| Metric | A-baseline | B-cold | B-warm |
|---|---|---|---|
| Turns                  | 3 | 5 | 4 |
| Input tokens           | 22762 | 43905 | 26138 |
| Cache creation tokens  | 0 | 4818 | 0 |
| Cache read tokens      | 0 | 19272 | 19272 |
| Output tokens          | 11921 | 8000 | 4214 |
| **Billed input (in + cache_creation×1.25 + cache_read×0.1)** | 22762 | 51855 | 28065 |
| Duration (s)           | 137.4 | 108.0 | 54.6 |
| Files written          | 10 | 2 | 2 |

### Tool calls

| Tool | A-baseline | B-cold | B-warm |
|---|---|---|---|
| write_files | 2 | 2 | 1 |
| query_kit | 0 | 7 | 7 |

## Hallucination analysis

Counts of UI5 component usages where the component, attribute, or event does not exist in the graph.

| Metric | A-baseline | B-cold | B-warm |
|---|---|---|---|
| Total `<ui5-*>` usages | 9 | 11 | 9 |
| Distinct components used | 9 | 8 | 8 |
| **Unknown components** | 3 | 0 | 0 |
| **Unknown properties** | 1 | 0 | 0 |
| **Unknown events** | 0 | 5 | 5 |

### A-baseline — details

**Unknown components:**
- `<ui5-list-item-standard>` in `src/app/product-list-page.component.ts`
- `<ui5-badge>` in `src/app/product-list-page.component.ts`
- `<ui5-badge>` in `src/app/product-list-page.component.ts`

**Unknown properties:**
- `<ui5-list>` `mode` in `src/app/product-list-page.component.ts`

### B-cold — details

**Unknown events:**
- `<ui5-shellbar>` `(ui5NotificationsClick)` in `src/app/product-list-page.component.ts`
- `<ui5-shellbar>` `(ui5ProfileClick)` in `src/app/product-list-page.component.ts`
- `<ui5-input>` `(ui5Input)` in `src/app/product-list-page.component.ts`
- `<ui5-list>` `(ui5SelectionChange)` in `src/app/product-list-page.component.ts`
- `<ui5-button>` `(ui5Click)` in `src/app/product-list-page.component.ts`

### B-warm — details

**Unknown events:**
- `<ui5-shellbar>` `(ui5NotificationsClick)` in `src/app/product-list-page.component.ts`
- `<ui5-shellbar>` `(ui5ProfileClick)` in `src/app/product-list-page.component.ts`
- `<ui5-input>` `(ui5Input)` in `src/app/product-list-page.component.ts`
- `<ui5-list>` `(ui5SelectionChange)` in `src/app/product-list-page.component.ts`
- `<ui5-button>` `(ui5Click)` in `src/app/product-list-page.component.ts`

## Final assistant text

### A-baseline
```
Here's a summary of every file produced and the key design decisions:

---

## Files generated

| File | Purpose |
|---|---|
| `src/app/sample-products.ts` | One-line export of 8 typed product objects |
| `src/app/product-list-page.component.ts` | **Main component** (all logic + template + styles) |
| `src/app/app.component.ts` | Minimal root host that mounts `<app-product-list-page>` |
| `src/main.ts` | `bootstrapApplication` entry point |
| `src/index.html` / `src/styles.css` | Global HTML shell + CSS reset |
| `tsconfig.json` / `tsconfig.app.json` | TypeScript config (`moduleResolution: bundler`) |
| `package.json` / `angular.json` | Angular 17 + UI5 v2 dependencies & build config |

---

## Architecture highlights

### `ProductListPage` component
- **`standalone: true`**, `OnPush` change detection, `CUSTOM_ELEMENTS_SCHEMA` for UI5 elements.
- **Signals** power the reactive state:
  - `selectedProduct = signal<Product | null>(null)` — updated on `(selection-change)`.
  - `cartAdded = signal(false)` — set to `true` for 3 seconds on "Add to Cart", then cleared.
- **`@for` control flow** (Angular 17+) renders the list items — no `*ngFor` needed.
- **`@if (...; as p)`** safely narrows the selected product to a non-null alias for the detail card.

### UI5 Web Components used
| Element | Role |
|---|---|
| `ui5-shellbar` | Sticky top bar with title, search, notifications badge, profile avatar |
| `ui5-avatar` (slotted) | Profile avatar with initials "JS" |
| `ui5-list` + `ui5-list-item-standard` | Single-select product list |
| `ui5-badge` | Coloured price tag + "In Stock" badge |
| `ui5-card` + `ui5-card-header` | Detail panel |
| `ui5-button design="Emphasized"` | "Add to Cart" CTA |

### SAP Horizon theming
- `setTheme('sap_horizon')` is called at module level after importing `@ui5/webcomponents-theming/dist/Assets.js`.
- All colours, spacing, border-radius and typography use **SAP design-token CSS variables** (`--sapBackgroundColor`, `--sapPositiveColor`, `--sapContent_LabelColor`, etc.) with sensible fallbacks.

### Getting started
```bash
npm install
npm start        # → http://localhost:4200
```
```

### B-cold
```
Here's a summary of everything that was generated:

---

## What was created

### `src/app/sample-products.ts`
Exports a `Product` interface (`id`, `name`, `price`, `category`, `description`) and an array of 8 realistic sample products across 4 categories (Electronics, Furniture, Kitchen, Sports/Accessories).

---

### `src/app/product-list-page.component.ts` — `ProductListPage`

**Architecture**
- Fully standalone, `ChangeDetectionStrategy.OnPush`, inline template + styles.
- `setTheme('sap_horizon')` called at module level (once, outside the class).
- All reactive state is **signals**: `selectedProduct`, `searchQuery`, `notificationCount`.
- `filteredProducts` is a `computed()` signal — auto-updates when `searchQuery` changes.

**UI5 components used**

| Component | Import | Purpose |
|---|---|---|
| `ShellBarComponent` | `@ui5/webcomponents-ngx/fiori` | Top app header |
| `InputComponent` | `@ui5/webcomponents-ngx/main` | ShellBar search (`slot="searchField"`) |
| `AvatarComponent` | `@ui5/webcomponents-ngx/main` | Profile avatar (`slot="profile"`, initials `JD`) |
| `ListComponent` | `@ui5/webcomponents-ngx/main` | Product list, `selectionMode="Single"` |
| `ListItemStandardComponent` | `@ui5/webcomponents-ngx/main` | Each product row (name + category + price) |
| `CardComponent` | `@ui5/webcomponents-ngx/main` | Detail panel |
| `CardHeaderComponent` | `@ui5/webcomponents-ngx/main` | Card title (product name + category) |
| `ButtonComponent` | `@ui5/webcomponents-ngx/main` | "Add to Cart" — design `Emphasized` + cart icon |

**Key behaviour**
- All events use the `ui5` prefix (`(ui5SelectionChange)`, `(ui5Click)`, etc.) — no raw DOM events.
- No `[attr.*]` bindings — only proper Angular `@Input()` bindings.
- Searching clears the selection and re-derives the list reactively.
- Detail panel shows an empty-state placeholder until a product is selected.
- Notification badge clears to `0` when the bell is clicked.
```

### B-warm
```
Done. Here's a summary of what was generated:

---

## Files created

### `src/app/sample-products.ts`
Exports a `Product` interface and `SAMPLE_PRODUCTS` — 8 items covering four categories: Electronics, Furniture, Peripherals, and Accessories.

---

### `src/app/product-list-page.component.ts`
A fully standalone `ProductListPage` component with:

| Area | Details |
|---|---|
| **Theme** | `setTheme('sap_horizon')` called at module load |
| **ShellBar** | `primaryTitle="Product Catalog"`, notifications badge (`3`), search field via `slot="searchField"`, profile avatar (`initials="JD"`) via `slot="profile"` |
| **Left panel (60%)** | `<ui5-list selectionMode="Single">` with 8 `<ui5-li>` items. Each item shows name, category as description, price as `additionalText` (green `Positive` state), and a category-mapped icon. Header shows filtered count. |
| **Right panel (40%)** | `<ui5-card>` with `<ui5-card-header>` (product name + category), detail rows for Price / Category / ID, a description paragraph, and an **Emphasized** `<ui5-button icon="cart">Add to Cart</ui5-button>` |
| **Search** | Filters the list reactively via Angular signals; clears selection if selected item is filtered out |
| **Signals** | `selectedProduct` and `searchQuery` are `signal()`s; `filteredProducts` is a derived computation |
| **Change detection** | `OnPush` |
| **Styling** | All colours/spacing use `var(--sap*)` Horizon CSS variables |
```
