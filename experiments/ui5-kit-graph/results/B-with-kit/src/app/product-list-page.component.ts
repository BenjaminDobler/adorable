import { Component, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

import { ShellBarComponent } from '@ui5/webcomponents-ngx/fiori';
import {
  AvatarComponent,
  ButtonComponent,
  CardComponent,
  CardHeaderComponent,
  InputComponent,
  ListComponent,
  ListItemStandardComponent,
} from '@ui5/webcomponents-ngx/main';

import { SAMPLE_PRODUCTS, Product } from './sample-products';

setTheme('sap_horizon');

@Component({
  selector: 'app-product-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ShellBarComponent,
    AvatarComponent,
    ButtonComponent,
    CardComponent,
    CardHeaderComponent,
    InputComponent,
    ListComponent,
    ListItemStandardComponent,
  ],
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: var(--sapBackgroundColor, #f5f6f7);
      font-family: var(--sapFontFamily, '72', Arial, sans-serif);
    }

    .page-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      gap: 1rem;
      padding: 1rem;
    }

    /* ── Left panel ───────────────────────────────────── */
    .left-panel {
      flex: 0 0 60%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 0.5rem;
      background: var(--sapList_Background, #fff);
      box-shadow: var(--sapContent_Shadow0, 0 0 0 1px rgba(0,0,0,.08));
    }

    .left-panel ui5-list {
      flex: 1;
      overflow-y: auto;
    }

    /* ── Right panel ──────────────────────────────────── */
    .right-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .detail-card {
      flex: 1;
    }

    /* ── Card body layout ─────────────────────────────── */
    .card-body {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--sapList_BorderColor, #e5e5e5);
    }

    .detail-row:last-of-type {
      border-bottom: none;
    }

    .detail-label {
      color: var(--sapContent_LabelColor, #556b82);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .detail-value {
      color: var(--sapTextColor, #131e29);
      font-size: 0.875rem;
    }

    .detail-price {
      color: var(--sapPositiveColor, #256f3a);
      font-size: 1.375rem;
      font-weight: 700;
    }

    .detail-description {
      margin: 0;
      color: var(--sapContent_NonInteractiveIconColor, #758ca4);
      font-size: 0.8125rem;
      line-height: 1.6;
    }

    /* ── Add to cart row ─────────────────────────────── */
    .add-to-cart-row {
      display: flex;
      justify-content: flex-end;
      padding-top: 0.25rem;
    }

    /* ── Empty state ─────────────────────────────────── */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      border-radius: 0.5rem;
      background: var(--sapList_Background, #fff);
      box-shadow: var(--sapContent_Shadow0, 0 0 0 1px rgba(0,0,0,.08));
      color: var(--sapContent_LabelColor, #556b82);
    }

    .empty-state-icon {
      font-size: 3rem;
      line-height: 1;
      opacity: 0.4;
    }

    .empty-state-text {
      font-size: 0.9375rem;
    }
  `],
  template: `
    <!-- ── ShellBar ───────────────────────────────────────────── -->
    <ui5-shellbar
      [primaryTitle]="'Product Catalog'"
      [showNotifications]="true"
      [notificationsCount]="notificationCount()"
      [showSearchField]="true"
      (ui5NotificationsClick)="onNotificationsClick()"
      (ui5ProfileClick)="onProfileClick()"
    >
      <!-- Search field in dedicated slot -->
      <ui5-input
        slot="searchField"
        [placeholder]="'Search products…'"
        [showClearIcon]="true"
        (ui5Input)="onSearch($event)"
      ></ui5-input>

      <!-- Profile avatar -->
      <ui5-avatar
        slot="profile"
        [initials]="'JD'"
        [colorScheme]="'Accent6'"
        [size]="'XS'"
        [interactive]="true"
      ></ui5-avatar>
    </ui5-shellbar>

    <!-- ── Two-column body ────────────────────────────────────── -->
    <div class="page-body">

      <!-- LEFT 60%: product list -->
      <div class="left-panel">
        <ui5-list
          [headerText]="'Products (' + filteredProducts().length + ')'"
          [selectionMode]="'Single'"
          [noDataText]="'No products match your search.'"
          (ui5SelectionChange)="onSelectionChange($event)"
        >
          @for (product of filteredProducts(); track product.id) {
            <ui5-li
              [description]="product.category"
              [additionalText]="'$' + product.price.toFixed(2)"
              [additionalTextState]="'Positive'"
              [selected]="selectedProduct()?.id === product.id"
              [icon]="categoryIcon(product.category)"
            >{{ product.name }}</ui5-li>
          }
        </ui5-list>
      </div>

      <!-- RIGHT 40%: detail card -->
      <div class="right-panel">

        @if (selectedProduct(); as product) {
          <ui5-card class="detail-card" [accessibleName]="product.name">

            <ui5-card-header
              slot="header"
              [titleText]="product.name"
              [subtitleText]="product.category"
              [additionalText]="'In Stock'"
            ></ui5-card-header>

            <div class="card-body">

              <div class="detail-row">
                <span class="detail-label">Price</span>
                <span class="detail-price">&dollar;{{ product.price.toFixed(2) }}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Category</span>
                <span class="detail-value">{{ product.category }}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Product&nbsp;ID</span>
                <span class="detail-value">#{{ product.id.toString().padStart(4, '0') }}</span>
              </div>

              <p class="detail-description">{{ product.description }}</p>

              <div class="add-to-cart-row">
                <ui5-button
                  [design]="'Emphasized'"
                  [icon]="'cart'"
                  (ui5Click)="addToCart(product)"
                >Add to Cart</ui5-button>
              </div>

            </div>
          </ui5-card>

        } @else {

          <div class="empty-state">
            <span class="empty-state-icon">🛍️</span>
            <span class="empty-state-text">Select a product to view its details</span>
          </div>

        }
      </div>

    </div>
  `,
})
export class ProductListPage {
  // ── State ────────────────────────────────────────────────────
  readonly selectedProduct = signal<Product | null>(null);
  readonly searchQuery     = signal<string>('');
  readonly notificationCount = signal<string>('3');

  // ── Derived ──────────────────────────────────────────────────
  readonly filteredProducts = computed<Product[]>(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return SAMPLE_PRODUCTS;
    return SAMPLE_PRODUCTS.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  });

  // ── Handlers ─────────────────────────────────────────────────
  onSelectionChange(event: CustomEvent): void {
    const selectedItems: HTMLElement[] = event.detail?.selectedItems ?? [];
    if (!selectedItems.length) {
      this.selectedProduct.set(null);
      return;
    }
    // The text content of the <ui5-li> is the product name
    const label = selectedItems[0].innerText?.split('\n')[0].trim();
    const found = SAMPLE_PRODUCTS.find(p => p.name === label) ?? null;
    this.selectedProduct.set(found);
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value ?? '';
    this.searchQuery.set(value);
    this.selectedProduct.set(null); // reset detail on new search
  }

  addToCart(product: Product): void {
    const n = parseInt(this.notificationCount(), 10);
    this.notificationCount.set(String(n + 1));
    console.log(`[Cart] Added: ${product.name} – $${product.price}`);
  }

  onNotificationsClick(): void {
    console.log('Notifications clicked');
  }

  onProfileClick(): void {
    console.log('Profile clicked');
  }

  // ── Helpers ──────────────────────────────────────────────────
  categoryIcon(category: string): string {
    const icons: Record<string, string> = {
      Furniture:   'physical-activity',
      Electronics: 'laptop',
      Audio:       'headset',
      Accessories: 'chain-link',
      Lighting:    'light-mode',
    };
    return icons[category] ?? 'product';
  }
}
