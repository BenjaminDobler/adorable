import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
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
      font-family: var(--sapFontFamily, 'SAP72', sans-serif);
    }

    .body {
      display: flex;
      flex: 1;
      overflow: hidden;
      gap: var(--sapContent_Space_M, 1rem);
      padding: var(--sapContent_Space_M, 1rem);
    }

    .left-panel {
      flex: 0 0 60%;
      overflow-y: auto;
      background-color: var(--sapList_Background, #fff);
      border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
      box-shadow: var(--sapContent_Shadow0, 0 0 0.25rem rgba(0,0,0,0.1));
    }

    .right-panel {
      flex: 0 0 calc(40% - var(--sapContent_Space_M, 1rem));
      overflow-y: auto;
    }

    .card-body {
      padding: var(--sapContent_Space_M, 1rem);
      display: flex;
      flex-direction: column;
      gap: var(--sapContent_Space_S, 0.5rem);
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.25rem 0;
      border-bottom: 1px solid var(--sapList_BorderColor, #e5e5e5);
    }

    .detail-label {
      color: var(--sapContent_LabelColor, #6a7a8a);
      font-size: var(--sapFontSmallSize, 0.75rem);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .detail-value {
      color: var(--sapTextColor, #131e29);
      font-size: var(--sapFontSize, 0.875rem);
    }

    .price-value {
      color: var(--sapPositiveColor, #256f3a);
      font-size: var(--sapFontHeader5Size, 1rem);
      font-weight: 700;
    }

    .description-text {
      color: var(--sapContent_NonInteractiveIconColor, #6a7a8a);
      font-size: var(--sapFontSize, 0.875rem);
      line-height: 1.5;
      padding: 0.5rem 0;
    }

    .add-to-cart-row {
      display: flex;
      justify-content: flex-end;
      padding-top: 0.5rem;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 200px;
      color: var(--sapContent_LabelColor, #6a7a8a);
      font-size: var(--sapFontSize, 0.875rem);
      gap: 0.5rem;
    }

    .empty-icon {
      font-size: 3rem;
    }
  `],
  template: `
    <!-- Shell bar header -->
    <ui5-shellbar
      [primaryTitle]="'Product Catalog'"
      [showNotifications]="true"
      [notificationsCount]="'3'"
      [showSearchField]="true"
      (ui5NotificationsClick)="onNotificationsClick()"
      (ui5ProfileClick)="onProfileClick()">

      <!-- Search field slot -->
      <ui5-input
        slot="searchField"
        [placeholder]="'Search products…'"
        [showClearIcon]="true"
        (ui5Input)="onSearch($event)">
      </ui5-input>

      <!-- Profile avatar slot -->
      <ui5-avatar
        slot="profile"
        [initials]="'JD'"
        [colorScheme]="'Accent6'"
        [size]="'XS'">
      </ui5-avatar>
    </ui5-shellbar>

    <!-- Two-column body -->
    <div class="body">

      <!-- LEFT: product list (60%) -->
      <div class="left-panel">
        <ui5-list
          [headerText]="'Products (' + filteredProducts().length + ')'"
          [selectionMode]="'Single'"
          (ui5SelectionChange)="onSelectionChange($event)">

          @for (product of filteredProducts(); track product.id) {
            <ui5-li
              [description]="product.category"
              [additionalText]="'$' + product.price.toFixed(2)"
              [additionalTextState]="'Positive'"
              [icon]="categoryIcon(product.category)"
              [selected]="selectedProduct()?.id === product.id">
              {{ product.name }}
            </ui5-li>
          }
        </ui5-list>
      </div>

      <!-- RIGHT: product detail card (40%) -->
      <div class="right-panel">
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
                <span class="price-value">${{ product.price.toFixed(2) }}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Category</span>
                <span class="detail-value">{{ product.category }}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Product ID</span>
                <span class="detail-value">#{{ product.id }}</span>
              </div>

              <p class="description-text">{{ product.description }}</p>

              <div class="add-to-cart-row">
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
          <div class="empty-state">
            <span class="empty-icon">🛍️</span>
            <strong>No product selected</strong>
            <span>Select a product from the list to see its details.</span>
          </div>
        }
      </div>

    </div>
  `,
})
export class ProductListPage {
  readonly allProducts = SAMPLE_PRODUCTS;

  readonly selectedProduct = signal<Product | null>(null);
  readonly searchQuery     = signal<string>('');

  readonly filteredProducts = () => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.allProducts;
    return this.allProducts.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  };

  onSelectionChange(event: CustomEvent): void {
    const selected = event.detail?.selectedItems?.[0];
    if (!selected) {
      this.selectedProduct.set(null);
      return;
    }
    // Match by the text content of the selected <ui5-li>
    const name = selected.textContent?.trim();
    const product = this.allProducts.find(p => p.name === name) ?? null;
    this.selectedProduct.set(product);
  }

  onSearch(event: CustomEvent): void {
    const value = (event.target as HTMLInputElement).value ?? '';
    this.searchQuery.set(value);
    // Clear selection if selected product is filtered out
    const current = this.selectedProduct();
    if (current && !this.filteredProducts().find(p => p.id === current.id)) {
      this.selectedProduct.set(null);
    }
  }

  addToCart(product: Product): void {
    alert(`"${product.name}" has been added to your cart!`);
  }

  onNotificationsClick(): void {
    alert('No new notifications.');
  }

  onProfileClick(): void {
    alert('Profile clicked — Jane Doe');
  }

  categoryIcon(category: string): string {
    const map: Record<string, string> = {
      Electronics:  'laptop',
      Furniture:    'customer-order-entry',
      Peripherals:  'keyboard-and-mouse',
      Accessories:  'wrench',
    };
    return map[category] ?? 'product';
  }
}
