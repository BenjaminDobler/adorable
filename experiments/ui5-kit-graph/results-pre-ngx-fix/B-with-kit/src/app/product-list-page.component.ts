import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

// UI5 Web Component imports
import '@ui5/webcomponents-fiori/dist/ShellBar.js';
import '@ui5/webcomponents/dist/Avatar.js';
import '@ui5/webcomponents/dist/Input.js';
import '@ui5/webcomponents/dist/List.js';
import '@ui5/webcomponents/dist/ListItemStandard.js';
import '@ui5/webcomponents/dist/Card.js';
import '@ui5/webcomponents/dist/CardHeader.js';
import '@ui5/webcomponents/dist/Button.js';
import '@ui5/webcomponents/dist/Tag.js';
import '@ui5/webcomponents/dist/Icon.js';
import '@ui5/webcomponents-icons/dist/cart.js';
import '@ui5/webcomponents-icons/dist/bell.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/product.js';

import { SAMPLE_PRODUCTS, Product } from './sample-products';

setTheme('sap_horizon');

@Component({
  selector: 'app-product-list-page',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background-color: var(--sapBackgroundColor, #f5f6f7);
      font-family: var(--sapFontFamily, '72', Arial, sans-serif);
    }

    /* ── Shellbar ── */
    .shellbar-search {
      width: 240px;
    }

    /* ── Body ── */
    .body {
      display: flex;
      gap: var(--sapContent_Space, 1rem);
      padding: 1.25rem 1.5rem;
      box-sizing: border-box;
      align-items: flex-start;
    }

    /* ── Left panel ── */
    .panel-left {
      flex: 3;
      min-width: 0;
      background: var(--sapList_Background, #fff);
      border-radius: var(--sapElement_BorderCornerRadius, 0.75rem);
      box-shadow: var(--sapContent_Shadow0, 0 0 0 0.0625rem rgba(0,0,0,.1));
      overflow: hidden;
    }

    .panel-left-header {
      padding: 0.75rem 1rem 0.5rem;
      border-bottom: var(--sapList_BorderWidth, 0.0625rem) solid var(--sapList_BorderColor, #e5e5e5);
    }

    .panel-left-header h2 {
      margin: 0;
      font-size: var(--sapFontHeader4Size, 1rem);
      font-weight: 600;
      color: var(--sapList_HeaderTextColor, #131e29);
    }

    .panel-left-header span {
      font-size: var(--sapFontSmallSize, 0.75rem);
      color: var(--sapContent_LabelColor, #556b82);
    }

    /* ── Right panel ── */
    .panel-right {
      flex: 2;
      min-width: 0;
      position: sticky;
      top: 1.25rem;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 3rem 1.5rem;
      background: var(--sapList_Background, #fff);
      border-radius: var(--sapElement_BorderCornerRadius, 0.75rem);
      box-shadow: var(--sapContent_Shadow0, 0 0 0 0.0625rem rgba(0,0,0,.1));
      color: var(--sapContent_LabelColor, #556b82);
      font-size: 0.9rem;
      text-align: center;
    }

    /* ── Card detail body ── */
    .card-body {
      padding: 1.25rem 1rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .detail-row {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }

    .detail-label {
      font-size: var(--sapFontSmallSize, 0.75rem);
      color: var(--sapContent_LabelColor, #556b82);
      min-width: 5rem;
    }

    .detail-value {
      font-size: var(--sapFontSize, 0.875rem);
      color: var(--sapTextColor, #131e29);
      font-weight: 500;
    }

    .price-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--sapPositiveColor, #188918);
    }

    .description-text {
      font-size: var(--sapFontSize, 0.875rem);
      color: var(--sapContent_LabelColor, #556b82);
      line-height: 1.5;
      padding: 0.5rem 0;
      border-top: var(--sapList_BorderWidth, 0.0625rem) solid var(--sapList_BorderColor, #e5e5e5);
    }

    .cart-action {
      display: flex;
      justify-content: flex-end;
      padding-top: 0.25rem;
    }

    /* ── List item additional text ── */
    .price-tag {
      font-size: var(--sapFontSmallSize, 0.75rem);
      color: var(--sapPositiveColor, #188918);
      font-weight: 600;
    }
  `],
  template: `
    <!-- ═══════════════════ SHELLBAR ═══════════════════ -->
    <ui5-shellbar
      primary-title="Product Catalog"
      secondary-title="SAP Horizon Demo"
      show-notifications
      notifications-count="3"
      show-search-field>

      <!-- Search field slot -->
      <ui5-input
        slot="searchField"
        class="shellbar-search"
        placeholder="Search products…"
        show-clear-icon>
        <ui5-icon slot="icon" name="search"></ui5-icon>
      </ui5-input>

      <!-- Profile avatar slot -->
      <ui5-avatar
        slot="profile"
        initials="JD"
        color-scheme="Accent6"
        size="XS"
        interactive
        accessible-name="John Doe profile">
      </ui5-avatar>
    </ui5-shellbar>

    <!-- ═══════════════════ BODY ═══════════════════ -->
    <div class="body">

      <!-- ─── LEFT: Product list (60%) ─── -->
      <div class="panel-left">
        <div class="panel-left-header">
          <h2>Products
            <span>&nbsp;({{ products.length }})</span>
          </h2>
        </div>

        <ui5-list
          selection-mode="Single"
          (selection-change)="onSelectionChange($event)">

          @for (product of products; track product.id) {
            <ui5-li
              [attr.data-id]="product.id"
              [attr.icon]="categoryIcon(product.category)"
              [attr.description]="product.category"
              [attr.additional-text]="'$' + product.price.toFixed(2)"
              additional-text-state="Positive"
              wrapping-type="Normal"
              [attr.selected]="selectedProduct()?.id === product.id ? true : null">
              {{ product.name }}
            </ui5-li>
          }
        </ui5-list>
      </div>

      <!-- ─── RIGHT: Detail card (40%) ─── -->
      <div class="panel-right">

        @if (!selectedProduct()) {
          <!-- Empty state -->
          <div class="empty-state">
            <ui5-icon name="product" style="font-size: 3rem; color: var(--sapContent_NonInteractiveIconColor, #556b82);"></ui5-icon>
            <p style="margin:0; font-weight:600;">No product selected</p>
            <p style="margin:0;">Pick an item from the list to see details.</p>
          </div>
        } @else {
          <!-- Product detail card -->
          <ui5-card [attr.accessible-name]="selectedProduct()!.name">

            <ui5-card-header
              slot="header"
              [attr.title-text]="selectedProduct()!.name"
              [attr.subtitle-text]="selectedProduct()!.category"
              [attr.additional-text]="'#' + selectedProduct()!.id">
            </ui5-card-header>

            <div class="card-body">

              <div class="detail-row">
                <span class="detail-label">Price</span>
                <span class="price-value">${{ selectedProduct()!.price.toFixed(2) }}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Category</span>
                <span class="detail-value">{{ selectedProduct()!.category }}</span>
              </div>

              <div class="detail-row">
                <span class="detail-label">Product ID</span>
                <span class="detail-value">#{{ selectedProduct()!.id }}</span>
              </div>

              <p class="description-text">{{ selectedProduct()!.description }}</p>

              <div class="cart-action">
                <ui5-button
                  design="Emphasized"
                  icon="cart"
                  (click)="onAddToCart()">
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
  readonly products: Product[] = SAMPLE_PRODUCTS;
  readonly selectedProduct = signal<Product | null>(null);

  /** Map category names to UI5 icon names */
  categoryIcon(category: string): string {
    const map: Record<string, string> = {
      Electronics: 'electronic-medical-record',
      Peripherals:  'keyboard-and-mouse',
      Furniture:   'office-chair',
      Storage:     'database',
      Lighting:    'lightbulb',
    };
    return map[category] ?? 'product';
  }

  onSelectionChange(event: Event): void {
    const detail = (event as CustomEvent).detail as { selectedItems: HTMLElement[] };
    const selectedEl = detail.selectedItems?.[0];
    if (!selectedEl) {
      this.selectedProduct.set(null);
      return;
    }
    const id = Number(selectedEl.getAttribute('data-id'));
    const product = this.products.find(p => p.id === id) ?? null;
    this.selectedProduct.set(product);
  }

  onAddToCart(): void {
    const product = this.selectedProduct();
    if (product) {
      // Real app would dispatch a cart action; console log for demo
      console.log(`Added to cart: ${product.name} — $${product.price.toFixed(2)}`);
    }
  }
}
