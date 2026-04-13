import { Component, signal, ChangeDetectionStrategy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

// UI5 Web Components imports
import '@ui5/webcomponents-fiori/dist/ShellBar.js';
import '@ui5/webcomponents/dist/Avatar.js';
import '@ui5/webcomponents/dist/Input.js';
import '@ui5/webcomponents/dist/List.js';
import '@ui5/webcomponents/dist/ListItemStandard.js';
import '@ui5/webcomponents/dist/Card.js';
import '@ui5/webcomponents/dist/CardHeader.js';
import '@ui5/webcomponents/dist/Button.js';
import '@ui5/webcomponents/dist/Tag.js';
import '@ui5/webcomponents/dist/Title.js';
import '@ui5/webcomponents/dist/Icon.js';
import '@ui5/webcomponents-icons/dist/cart.js';
import '@ui5/webcomponents-icons/dist/bell.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/tag.js';
import '@ui5/webcomponents-icons/dist/money-bills.js';

import { SAMPLE_PRODUCTS, Product } from './sample-products';

setTheme('sap_horizon');

@Component({
  selector: 'app-product-list-page',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ═══════════════ SHELLBAR ═══════════════ -->
    <ui5-shellbar
      primary-title="Product Catalog"
      secondary-title="SAP Horizon Demo"
      show-notifications
      notifications-count="3"
      show-search-field
    >
      <!-- Search field in the searchField slot -->
      <ui5-input
        slot="searchField"
        placeholder="Search products…"
        show-clear-icon
        style="width: 240px"
      ></ui5-input>

      <!-- Profile avatar in the profile slot -->
      <ui5-avatar
        slot="profile"
        initials="JD"
        color-scheme="Accent6"
        accessible-name="John Doe"
      ></ui5-avatar>
    </ui5-shellbar>

    <!-- ═══════════════ BODY ═══════════════ -->
    <div class="body">

      <!-- ── LEFT: product list (60%) ── -->
      <section class="panel panel-list">
        <ui5-list
          header-text="Products ({{ products.length }})"
          selection-mode="Single"
          (selection-change)="onSelectionChange($event)"
          class="product-list"
        >
          @for (p of products; track p.id) {
            <ui5-li
              [attr.data-id]="p.id"
              [attr.description]="p.category"
              [attr.additional-text]="formatPrice(p.price)"
              additional-text-state="Information"
              icon="tag"
              [attr.selected]="selectedProduct()?.id === p.id ? '' : null"
            >{{ p.name }}</ui5-li>
          }
        </ui5-list>
      </section>

      <!-- ── RIGHT: detail card (40%) ── -->
      <section class="panel panel-detail">
        @if (selectedProduct(); as p) {
          <ui5-card class="detail-card" [attr.accessible-name]="p.name">
            <ui5-card-header
              slot="header"
              [attr.title-text]="p.name"
              [attr.subtitle-text]="p.category"
              [attr.additional-text]="formatPrice(p.price)"
            ></ui5-card-header>

            <div class="card-body">
              <div class="detail-row">
                <span class="detail-label">Product ID</span>
                <ui5-tag design="Set1" color-scheme="6">#{{ p.id.toString().padStart(4, '0') }}</ui5-tag>
              </div>

              <div class="detail-row">
                <span class="detail-label">Category</span>
                <span class="detail-value">{{ p.category }}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Price</span>
                <span class="detail-value detail-price">{{ formatPrice(p.price) }}</span>
              </div>

              <div class="detail-row detail-desc">
                <span class="detail-label">Description</span>
                <span class="detail-value">{{ p.description }}</span>
              </div>

              <div class="card-actions">
                <ui5-button
                  design="Emphasized"
                  icon="cart"
                  (click)="addToCart(p)"
                >Add to Cart</ui5-button>
              </div>
            </div>
          </ui5-card>
        } @else {
          <!-- Empty state -->
          <div class="empty-state">
            <ui5-icon name="tag" class="empty-icon"></ui5-icon>
            <ui5-title level="H4">Select a product</ui5-title>
            <p class="empty-hint">Choose an item from the list to see its details here.</p>
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: var(--sapBackgroundColor, #f5f6f7);
      font-family: var(--sapFontFamily, "72", sans-serif);
    }

    /* ── Body layout ── */
    .body {
      display: flex;
      flex: 1;
      overflow: hidden;
      gap: var(--sapContent_Space, 1rem);
      padding: 1rem;
    }

    /* ── Panels ── */
    .panel {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
    }

    .panel-list {
      flex: 6 1 60%;
      background: var(--sapList_Background, #fff);
      box-shadow: var(--sapContent_Shadow0, 0 0 0 1px rgba(0,0,0,.1));
    }

    .panel-detail {
      flex: 4 1 40%;
      overflow-y: auto;
    }

    /* ── Product list ── */
    .product-list {
      height: 100%;
    }

    /* ── Detail card ── */
    .detail-card {
      height: auto;
      width: 100%;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
      padding: 1rem 1.25rem 1.25rem;
    }

    .detail-row {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .detail-label {
      min-width: 6.5rem;
      font-size: var(--sapFontSmallSize, 0.75rem);
      color: var(--sapContent_LabelColor, #6a6d70);
      font-weight: 600;
      padding-top: 0.125rem;
    }

    .detail-value {
      font-size: var(--sapFontSize, 0.875rem);
      color: var(--sapTextColor, #1d2d3e);
      flex: 1;
    }

    .detail-price {
      font-size: var(--sapFontMediumSize, 1rem);
      font-weight: 700;
      color: var(--sapPositiveColor, #188918);
    }

    .detail-desc {
      align-items: flex-start;
    }

    .card-actions {
      display: flex;
      justify-content: flex-end;
      padding-top: 0.5rem;
      border-top: var(--sapList_BorderWidth, 1px) solid var(--sapList_BorderColor, #e5e5e5);
      margin-top: 0.25rem;
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 16rem;
      gap: 0.75rem;
      background: var(--sapList_Background, #fff);
      border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
      box-shadow: var(--sapContent_Shadow0, 0 0 0 1px rgba(0,0,0,.1));
      padding: 2rem;
      text-align: center;
    }

    .empty-icon {
      font-size: 3rem;
      color: var(--sapContent_NonInteractiveIconColor, #8c8c8c);
    }

    .empty-hint {
      font-size: var(--sapFontSmallSize, 0.75rem);
      color: var(--sapContent_LabelColor, #6a6d70);
      margin: 0;
    }
  `]
})
export class ProductListPage {
  readonly products: Product[] = SAMPLE_PRODUCTS;
  readonly selectedProduct = signal<Product | null>(null);

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
  }

  onSelectionChange(event: Event): void {
    const detail = (event as CustomEvent).detail as { selectedItems: HTMLElement[] };
    const item = detail?.selectedItems?.[0];
    if (!item) {
      this.selectedProduct.set(null);
      return;
    }
    const id = Number(item.getAttribute('data-id'));
    this.selectedProduct.set(this.products.find(p => p.id === id) ?? null);
  }

  addToCart(product: Product): void {
    alert(`"${product.name}" added to cart!`);
  }
}
