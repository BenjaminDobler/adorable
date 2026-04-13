import {
  Component,
  signal,
  ChangeDetectionStrategy,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SAMPLE_PRODUCTS } from './sample-products';

export interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

@Component({
  selector: 'app-product-list-page',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background-color: var(--sapBackgroundColor, #f5f6f7);
        font-family: var(--sapFontFamily, '72', sans-serif);
      }

      .body-layout {
        display: flex;
        gap: var(--sapContent_Space, 1rem);
        padding: 1.25rem 1.5rem;
        height: calc(100vh - 3.5rem);
        box-sizing: border-box;
      }

      .left-panel {
        flex: 0 0 60%;
        max-width: 60%;
        background: var(--sapGroup_ContentBackground, #ffffff);
        border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
        border: 1px solid var(--sapGroup_ContentBorderColor, #e0e0e0);
        overflow-y: auto;
        box-shadow: var(--sapContent_Shadow0, 0 0 0 1px rgba(0,0,0,.05), 0 2px 4px rgba(0,0,0,.08));
      }

      .left-panel-header {
        padding: 0.875rem 1rem 0.5rem;
        border-bottom: 1px solid var(--sapGroup_ContentBorderColor, #e0e0e0);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .left-panel-title {
        font-size: var(--sapFontHeader5Size, 1rem);
        font-weight: 700;
        color: var(--sapTitleColor, #1c1c1c);
        margin: 0;
      }

      .product-count {
        font-size: var(--sapFontSmallSize, 0.75rem);
        color: var(--sapContent_LabelColor, #6a6d70);
        background: var(--sapAccentColor6, #e8f3ff);
        color: var(--sapInformativeColor, #0070f2);
        padding: 0.125rem 0.5rem;
        border-radius: 1rem;
        font-weight: 600;
      }

      .right-panel {
        flex: 0 0 40%;
        max-width: 40%;
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 320px;
        background: var(--sapGroup_ContentBackground, #ffffff);
        border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
        border: 1px solid var(--sapGroup_ContentBorderColor, #e0e0e0);
        box-shadow: var(--sapContent_Shadow0, 0 0 0 1px rgba(0,0,0,.05), 0 2px 4px rgba(0,0,0,.08));
        color: var(--sapContent_LabelColor, #6a6d70);
        font-size: var(--sapFontSize, 0.875rem);
        gap: 0.75rem;
      }

      .empty-icon {
        font-size: 3rem;
        opacity: 0.35;
      }

      .empty-label {
        font-size: 0.9375rem;
        color: var(--sapContent_LabelColor, #6a6d70);
      }

      .detail-card {
        height: 100%;
      }

      .card-body {
        padding: 1.25rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem 1.25rem;
      }

      .detail-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .detail-label {
        font-size: var(--sapFontSmallSize, 0.75rem);
        color: var(--sapContent_LabelColor, #6a6d70);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .detail-value {
        font-size: var(--sapFontSize, 0.875rem);
        color: var(--sapTextColor, #1c1c1c);
        font-weight: 500;
      }

      .detail-value.price {
        font-size: 1.375rem;
        font-weight: 700;
        color: var(--sapPositiveColor, #188918);
      }

      .category-badge {
        display: inline-block;
        padding: 0.2rem 0.65rem;
        border-radius: 1rem;
        font-size: var(--sapFontSmallSize, 0.75rem);
        font-weight: 600;
        background: var(--sapHighlightColor, #0070f2);
        color: #fff;
        width: fit-content;
      }

      .divider {
        border: none;
        border-top: 1px solid var(--sapGroup_ContentBorderColor, #e0e0e0);
        margin: 0;
      }

      .add-to-cart-row {
        display: flex;
        justify-content: flex-end;
        padding-top: 0.25rem;
      }

      ui5-list {
        width: 100%;
      }

      ui5-card {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      .product-item-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      .item-category-tag {
        font-size: 0.7rem;
        padding: 0.1rem 0.45rem;
        border-radius: 0.75rem;
        background: var(--sapNeutralBackground, #f2f2f2);
        color: var(--sapContent_LabelColor, #6a6d70);
        font-weight: 600;
        letter-spacing: 0.02em;
      }
    `,
  ],
  template: `
    <!-- ═══════════════ SHELLBAR ═══════════════ -->
    <ui5-shellbar
      primary-title="Product Catalog"
      secondary-title="SAP Horizon"
      show-notifications
      notifications-count="3"
      show-product-switch
      (click)="onShellbarClick($event)"
    >
      <ui5-input
        slot="searchField"
        placeholder="Search products…"
        show-clear-icon
        style="width: 220px"
        (input)="onSearch($event)"
      ></ui5-input>

      <ui5-avatar
        slot="profile"
        initials="JD"
        color-scheme="Accent6"
        size="XS"
        style="cursor:pointer"
      ></ui5-avatar>
    </ui5-shellbar>

    <!-- ═══════════════ BODY ═══════════════ -->
    <div class="body-layout">

      <!-- ── LEFT: product list ── -->
      <div class="left-panel">
        <div class="left-panel-header">
          <h2 class="left-panel-title">All Products</h2>
          <span class="product-count">{{ filteredProducts().length }}</span>
        </div>

        <ui5-list
          mode="SingleSelect"
          (selection-change)="onSelectionChange($event)"
          no-data-text="No products found"
        >
          @for (product of filteredProducts(); track product.id) {
            <ui5-li
              [attr.data-id]="product.id"
              [attr.selected]="selectedProduct()?.id === product.id ? true : null"
              description="{{ product.category }} · ${{ product.price | number:'1.2-2' }}"
              icon="product"
              icon-end
            >
              {{ product.name }}
            </ui5-li>
          }
        </ui5-list>
      </div>

      <!-- ── RIGHT: detail card ── -->
      <div class="right-panel">

        @if (!selectedProduct()) {
          <div class="empty-state">
            <span class="empty-icon">📦</span>
            <span class="empty-label">Select a product to view details</span>
          </div>
        } @else {
          <ui5-card class="detail-card">
            <ui5-card-header
              slot="header"
              [attr.title-text]="selectedProduct()!.name"
              [attr.subtitle-text]="'Category: ' + selectedProduct()!.category"
              status="In Stock"
            >
              <ui5-icon slot="avatar" name="product"></ui5-icon>
            </ui5-card-header>

            <div class="card-body">

              <!-- Detail grid -->
              <div class="detail-grid">
                <div class="detail-field">
                  <span class="detail-label">Product ID</span>
                  <span class="detail-value">#{{ selectedProduct()!.id.toString().padStart(4, '0') }}</span>
                </div>

                <div class="detail-field">
                  <span class="detail-label">Category</span>
                  <span class="category-badge">{{ selectedProduct()!.category }}</span>
                </div>

                <div class="detail-field">
                  <span class="detail-label">Unit Price</span>
                  <span class="detail-value price">
                    ${{ selectedProduct()!.price | number:'1.2-2' }}
                  </span>
                </div>

                <div class="detail-field">
                  <span class="detail-label">Availability</span>
                  <span class="detail-value" style="color: var(--sapPositiveColor, #188918)">● In Stock</span>
                </div>
              </div>

              <hr class="divider" />

              <!-- Description placeholder -->
              <div class="detail-field">
                <span class="detail-label">Description</span>
                <span class="detail-value" style="line-height:1.55; color: var(--sapContent_LabelColor)">
                  {{ selectedProduct()!.name }} is a premium item in the
                  {{ selectedProduct()!.category }} category, crafted for
                  professional-grade performance and reliability.
                </span>
              </div>

              <hr class="divider" />

              <!-- CTA -->
              <div class="add-to-cart-row">
                <ui5-button
                  design="Emphasized"
                  icon="cart"
                  (click)="addToCart(selectedProduct()!)"
                >
                  Add to Cart
                </ui5-button>
              </div>

            </div>
          </ui5-card>
        }

      </div>
    </div>
  `,
})
export class ProductListPage {
  readonly allProducts: Product[] = SAMPLE_PRODUCTS;

  selectedProduct = signal<Product | null>(null);
  searchQuery = signal<string>('');

  filteredProducts = (): Product[] => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.allProducts;
    return this.allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  };

  onSelectionChange(event: Event): void {
    const customEvent = event as CustomEvent;
    const selectedItems: HTMLElement[] =
      customEvent.detail?.selectedItems ?? [];
    if (selectedItems.length === 0) {
      this.selectedProduct.set(null);
      return;
    }
    const item = selectedItems[0] as HTMLElement;
    const id = Number(item.getAttribute('data-id'));
    const found = this.allProducts.find((p) => p.id === id) ?? null;
    this.selectedProduct.set(found);
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value ?? '');
    // Reset selection when search changes
    this.selectedProduct.set(null);
  }

  addToCart(product: Product): void {
    console.log('Added to cart:', product);
    // Integrate with a cart service as needed
  }

  onShellbarClick(event: Event): void {
    // Handle shellbar actions (notifications, product-switch, etc.)
  }
}
