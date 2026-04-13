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
      background-color: var(--sapBackgroundColor, #f5f6f7);
      font-family: var(--sapFontFamily, '72', sans-serif);
    }

    /* ── Body layout ────────────────────────────────────────── */
    .page-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      gap: var(--sapContent_Space_S, 0.5rem);
      padding: var(--sapContent_Space_M, 1rem);
    }

    /* ── Left column (product list) ─────────────────────────── */
    .list-column {
      flex: 0 0 60%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
      background: var(--sapList_Background, #fff);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    }

    .list-column ui5-list {
      overflow-y: auto;
      flex: 1;
    }

    /* ── Right column (detail card) ─────────────────────────── */
    .detail-column {
      flex: 0 0 calc(40% - var(--sapContent_Space_S, 0.5rem));
      display: flex;
      flex-direction: column;
    }

    ui5-card {
      flex: 1;
    }

    /* ── Card body internals ─────────────────────────────────── */
    .card-body {
      padding: var(--sapContent_Space_L, 1.5rem);
      display: flex;
      flex-direction: column;
      gap: var(--sapContent_Space_M, 1rem);
      height: 100%;
      box-sizing: border-box;
    }

    .detail-row {
      display: flex;
      align-items: center;
      gap: var(--sapContent_Space_S, 0.5rem);
    }

    .detail-label {
      font-size: var(--sapFontSmallSize, 0.75rem);
      color: var(--sapContent_LabelColor, #6a7387);
      min-width: 5.5rem;
    }

    .detail-value {
      font-size: var(--sapFontSize, 0.875rem);
      color: var(--sapTextColor, #131e29);
      font-weight: 600;
    }

    .price-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.75rem;
      border-radius: 1rem;
      background: var(--sapList_SelectionBackgroundColor, #ebf8ff);
      color: var(--sapList_SelectionBorderColor, #0064d9);
      font-weight: 700;
      font-size: var(--sapFontSize, 0.875rem);
    }

    .detail-description {
      margin: 0;
      font-size: var(--sapFontSize, 0.875rem);
      color: var(--sapTextColor, #131e29);
      line-height: 1.6;
      flex: 1;
    }

    .cart-action {
      margin-top: auto;
      padding-top: var(--sapContent_Space_M, 1rem);
      border-top: 1px solid var(--sapList_BorderColor, #e5e5e5);
    }

    /* ── Empty / placeholder state ──────────────────────────── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: var(--sapContent_Space_M, 1rem);
      color: var(--sapContent_LabelColor, #6a7387);
      font-size: var(--sapFontSize, 0.875rem);
      text-align: center;
    }

    .empty-icon {
      font-size: 3rem;
      line-height: 1;
    }
  `],
  template: `
    <!-- ───── ShellBar ───── -->
    <ui5-shellbar
      [primaryTitle]="'Product Catalog'"
      [showNotifications]="true"
      [notificationsCount]="notificationCount()"
      [showSearchField]="true"
      (ui5NotificationsClick)="onNotificationsClick()"
      (ui5ProfileClick)="onProfileClick()">

      <!-- Search field (searchField slot) -->
      <ui5-input
        slot="searchField"
        [placeholder]="'Search products…'"
        [showClearIcon]="true"
        (ui5Input)="onSearch($event)">
      </ui5-input>

      <!-- Profile avatar (profile slot) -->
      <ui5-avatar
        slot="profile"
        [initials]="'JD'"
        [colorScheme]="'Accent6'"
        [size]="'XS'"
        [interactive]="true">
      </ui5-avatar>
    </ui5-shellbar>

    <!-- ───── Two-column body ───── -->
    <div class="page-body">

      <!-- LEFT: product list (60%) -->
      <div class="list-column">
        <ui5-list
          [headerText]="'Products (' + filteredProducts().length + ')'"
          [selectionMode]="'Single'"
          [noDataText]="'No products match your search'"
          (ui5SelectionChange)="onSelectionChange($event)">

          @for (product of filteredProducts(); track product.id) {
            <ui5-li
              [description]="product.category"
              [additionalText]="'$' + product.price.toFixed(2)"
              [additionalTextState]="'Information'"
              [selected]="selectedProduct()?.id === product.id">
              {{ product.name }}
            </ui5-li>
          }

        </ui5-list>
      </div>

      <!-- RIGHT: detail card (40%) -->
      <div class="detail-column">

        @if (selectedProduct(); as product) {

          <ui5-card [accessibleName]="product.name">

            <ui5-card-header
              slot="header"
              [titleText]="product.name"
              [subtitleText]="product.category">
            </ui5-card-header>

            <div class="card-body">

              <div class="detail-row">
                <span class="detail-label">Price</span>
                <span class="price-badge">&#36;{{ product.price.toFixed(2) }}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Category</span>
                <span class="detail-value">{{ product.category }}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Product ID</span>
                <span class="detail-value">#{{ product.id }}</span>
              </div>

              <p class="detail-description">{{ product.description }}</p>

              <div class="cart-action">
                <ui5-button
                  [design]="'Emphasized'"
                  [icon]="'cart'"
                  (ui5Click)="addToCart(product)">
                  Add to Cart
                </ui5-button>
              </div>

            </div>
          </ui5-card>

        } @else {

          <ui5-card [accessibleName]="'No selection'">
            <ui5-card-header
              slot="header"
              [titleText]="'Product Details'"
              [subtitleText]="'Select an item to see details'">
            </ui5-card-header>
            <div class="card-body">
              <div class="empty-state">
                <span class="empty-icon">🛍️</span>
                <span>Select a product from the list<br>to view its details here.</span>
              </div>
            </div>
          </ui5-card>

        }

      </div>
    </div>
  `,
})
export class ProductListPage {

  // ── State ──────────────────────────────────────────────────────────────
  readonly selectedProduct = signal<Product | null>(null);
  readonly searchQuery     = signal<string>('');
  readonly notificationCount = signal<string>('3');

  /** Products filtered reactively by the search query signal. */
  readonly filteredProducts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return SAMPLE_PRODUCTS;
    return SAMPLE_PRODUCTS.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  });

  // ── Event handlers ─────────────────────────────────────────────────────

  onSelectionChange(event: CustomEvent): void {
    const selectedItems: Element[] = event.detail?.selectedItems ?? [];
    if (selectedItems.length === 0) {
      this.selectedProduct.set(null);
      return;
    }
    // The text content of the <ui5-li> is the product name
    const itemText = (selectedItems[0] as HTMLElement).textContent?.trim() ?? '';
    const match = SAMPLE_PRODUCTS.find(p => p.name === itemText) ?? null;
    this.selectedProduct.set(match);
  }

  onSearch(event: Event): void {
    const value = ((event as CustomEvent).target as HTMLInputElement).value ?? '';
    this.searchQuery.set(value);
    this.selectedProduct.set(null);  // reset detail on new search
  }

  addToCart(product: Product): void {
    alert(`"${product.name}" added to your cart! 🛒`);
  }

  onNotificationsClick(): void {
    this.notificationCount.set('0');
    alert('No new notifications.');
  }

  onProfileClick(): void {
    alert('User: Jane Doe\nRole: Administrator');
  }
}
