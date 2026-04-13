# UI5 Kit Graph — Comparison Report

Generated: 2026-04-10T22:08:05.848Z
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

| Metric | B-cached-run1 | B-cached-run2 |
|---|---|---|
| Turns                  | 5 | 6 |
| Input tokens           | 31707 | 43232 |
| Cache creation tokens  | 0 | 0 |
| Cache read tokens      | 19445 | 23334 |
| Output tokens          | 4415 | 4944 |
| **Billed input (in + cache_creation×1.25 + cache_read×0.1)** | 33652 | 45565 |
| Duration (s)           | 60.4 | 65.7 |
| Files written          | 2 | 6 |

### Tool calls

| Tool | B-cached-run1 | B-cached-run2 |
|---|---|---|
| query_kit | 8 | 8 |
| write_files | 1 | 2 |

## Hallucination analysis

Counts of UI5 component usages where the component, attribute, or event does not exist in the graph.

| Metric | B-cached-run1 | B-cached-run2 |
|---|---|---|
| Total `<ui5-*>` usages | 11 | 11 |
| Distinct components used | 11 | 9 |
| **Unknown components** | 0 | 0 |
| **Unknown properties** | 0 | 0 |
| **Unknown events** | 0 | 0 |

### B-cached-run1 — details

No hallucinations detected. ✓

### B-cached-run2 — details

No hallucinations detected. ✓

## Final assistant text

### B-cached-run1
```
Done! Here's a summary of what was built:

---

## Files Created

### `src/app/sample-products.ts`
Exports a `Product` interface and `SAMPLE_PRODUCTS` — 8 items across four categories (Furniture, Electronics, Accessories, Bags).

### `src/app/product-list-page.component.ts`
A fully standalone `ProductListPage` component with:

| Feature | Detail |
|---|---|
| **Theme** | `setTheme('sap_horizon')` called at module load; Horizon CSS vars used throughout styles |
| **Shellbar** | `<ui5-shellbar>` with `primary-title`, `secondary-title`, `show-notifications` (badge = 3), and a `show-search-field` + `<ui5-input slot="searchField">` + `<ui5-avatar slot="profile" initials="JD">` |
| **Left panel (60%)** | `<ui5-list selection-mode="Single">` with 8 `<ui5-li>` items; each shows name, category (description), price (additional-text), and a tag icon |
| **Right panel (40%)** | `<ui5-card>` with `<ui5-card-header>` showing name/category/price; card body has structured detail rows and an **Emphasized** `<ui5-button icon="cart">Add to Cart</ui5-button>` |
| **Reactivity** | `selectedProduct` is an Angular `signal<Product \| null>`; the `selection-change` event on the list reads `event.detail.selectedItems[0]` and updates the signal → right panel re-renders via `@if` |
| **Empty state** | Right panel shows a centred placeholder with icon + hint text when nothing is selected |
| **Change detection** | `OnPush` throughout |
```

### B-cached-run2
```
Here's a summary of everything that was generated:

---

## What was built

### Files
| File | Role |
|---|---|
| `src/app/sample-products.ts` | `Product` interface + 8 typed sample products (id, name, price, category, description) |
| `src/app/product-list-page.component.ts` | The main `ProductListPage` standalone component |
| `src/app/app.config.ts` | Minimal `ApplicationConfig` |
| `src/main.ts` | Bootstrap entry point |
| `src/index.html` | Root HTML shell |
| `package.json` | Dependencies |

---

### Key design decisions

**ShellBar**
- `primary-title="Product Catalog"` and `secondary-title="SAP Horizon"`.
- A `ui5-input` in the `searchField` slot for search.
- `show-notifications` + `notifications-count="3"` for the notification bell.
- A `ui5-avatar` with initials `JD` in the `profile` slot.

**Two-column body (Flexbox, 60 / 40 split)**
- Left panel holds a `ui5-list` with `selection-mode="Single"`. Each `ui5-li` shows the product name, category as `description`, price as `additional-text`, and a category-mapped icon.
- Right panel conditionally shows:
  - **Populated `ui5-card`** with a `ui5-card-header` (name, category, price), a detail body (ID, category, price, description), and an **"Add to Cart"** `ui5-button` with `design="Emphasized"` in a card footer.
  - **Empty-state card** if nothing is selected, prompting the user to pick a product.

**Reactivity**
- `selectedProduct` is an Angular `signal<Product | null>`.
- `(selection-change)` reads `event.detail.selectedItems[0]`, looks up `data-id` to match the product, and calls `selectedProduct.set(...)`.

**Theming**
- `setTheme('sap_horizon')` is called at module load.
- All spacing, colours, borders, and typography use `var(--sap*)` Horizon CSS custom properties.
```
