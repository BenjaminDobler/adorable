import {
  Component,
  signal,
  ChangeDetectionStrategy,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SAMPLE_PRODUCTS } from './sample-products';

// ── UI5 Web Components ──────────────────────────────────────────────────────
import '@ui5/webcomponents/dist/ShellBar.js';
import '@ui5/webcomponents/dist/ShellBarItem.js';
import '@ui5/webcomponents/dist/List.js';
import '@ui5/webcomponents/dist/ListItemStandard.js';
import '@ui5/webcomponents/dist/Card.js';
import '@ui5/webcomponents/dist/CardHeader.js';
import '@ui5/webcomponents/dist/Button.js';
import '@ui5/webcomponents/dist/Badge.js';
import '@ui5/webcomponents/dist/Avatar.js';
import '@ui5/webcomponents/dist/Icon.js';

// ── SAP Horizon theme ───────────────────────────────────────────────────────
import '@ui5/webcomponents-theming/dist/Assets.js';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

setTheme('sap_horizon');

// ── Types ───────────────────────────────────────────────────────────────────
export interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

// ── Component ───────────────────────────────────────────────────────────────
@Component({
  selector: 'app-product-list-page',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,

  // ── Styles ────────────────────────────────────────────────────────────────
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: var(--sapBackgroundColor, #f5f6f7);
      font-family: var(--sapFontFamily, '72', sans-serif);
    }

    /* Shell bar */
    .shellbar-wrapper {
      position: sticky;
      top: 0;
      z-index: 100;
    }
    ui5-shellbar { width: 100%; }

    /* Body layout */
    .body {
      display: flex;
      flex: 1;
      gap: 1.25rem;
      padding: 1.5rem 2rem;
      box-sizing: border-box;
      align-items: flex-start;
    }

    /* Left panel */
    .left-panel {
      flex: 0 0 60%;
      max-width: 60%;
      background: var(--sapGroup_ContentBackground, #fff);
      border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
      box-shadow: var(--sapContent_Shadow0, 0 0 0 1px rgba(0,0,0,.08));
      overflow: hidden;
    }
    .panel-title {
      font-size: var(--sapFontHeader4Size, 1rem);
      font-weight: 700;
      color: var(--sapGroup_TitleTextColor, #1d2d3e);
      padding: 1rem 1.25rem 0.75rem;
      margin: 0;
      border-bottom: 1px solid var(--sapGroup_ContentBorderColor, #e5e5e5);
    }
    ui5-list { display: block; }

    /* Right panel */
    .right-panel {
      flex: 0 0 40%;
      max-width: 40%;
      position: sticky;
      top: 4.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 3rem 1.5rem;
      background: var(--sapGroup_ContentBackground, #fff);
      border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
      box-shadow: var(--sapContent_Shadow0, 0 0 0 1px rgba(0,0,0,.08));
      color: var(--sapContent_LabelColor, #6a7586);
      font-size: 0.9rem;
      text-align: center;
    }
    .empty-icon { font-size: 2.5rem; }

    /* Card */
    ui5-card { width: 100%; display: block; }
    .card-body {
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    /* Detail grid inside card */
    .detail-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      row-gap: 0.65rem;
      column-gap: 1rem;
      font-size: 0.875rem;
    }
    .detail-label {
      color: var(--sapContent_LabelColor, #6a7586);
      font-weight: 600;
    }
    .detail-value { color: var(--sapTextColor, #1d2d3e); }
    .price-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--sapPositiveColor, #188918);
    }

    /* Add-to-cart row */
    .cart-action {
      display: flex;
      justify-content: flex-end;
      padding-top: 0.75rem;
      border-top: 1px solid var(--sapGroup_ContentBorderColor, #e5e5e5);
    }

    /* Success toast */
    .toast {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.65rem 1rem;
      background: var(--sapSuccessBackground, #f1fdf6);
      border: 1px solid var(--sapPositiveColor, #188918);
      border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
      color: var(--sapPositiveColor, #188918);
      font-size: 0.85rem;
      animation: fadeIn .2s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
  `],

  // ── Template ──────────────────────────────────────────────────────────────
  template: `
    <!-- ╔══════════════════════════════════╗
         ║           SHELL BAR              ║
         ╚══════════════════════════════════╝ -->
    <div class="shellbar-wrapper">
      <ui5-shellbar
        primary-title="Product Catalog"
        secondary-title="SAP Horizon"
        show-search-field
        notifications-count="3"
        show-notifications
      >
        <!-- Profile avatar -->
        <ui5-avatar
          slot="profile"
          initials="JS"
          color-scheme="Accent6"
          accessible-name="John Smith"
        ></ui5-avatar>
      </ui5-shellbar>
    </div>

    <!-- ╔══════════════════════════════════╗
         ║             BODY                 ║
         ╚══════════════════════════════════╝ -->
    <div class="body">

      <!-- ── LEFT: product list (60%) ── -->
      <section class="left-panel">
        <h2 class="panel-title">Products ({{ products.length }})</h2>

        <ui5-list
          mode="SingleSelect"
          accessible-name="Product list"
          (selection-change)="onSelectionChange($event)"
        >
          @for (p of products; track p.id) {
            <ui5-list-item-standard
              [attr.data-id]="p.id"
              [attr.description]="p.category"
              icon="product"
              [attr.accessible-name]="p.name"
            >
              {{ p.name }}
              <ui5-badge
                slot="additionalContent"
                [attr.color-scheme]="badgeColor(p.category)"
              >{{ formatPrice(p.price) }}</ui5-badge>
            </ui5-list-item-standard>
          }
        </ui5-list>
      </section>

      <!-- ── RIGHT: detail card (40%) ── -->
      <aside class="right-panel">

        @if (!selectedProduct()) {
          <div class="empty-state">
            <span class="empty-icon">🛍️</span>
            <strong>No product selected</strong>
            <span>Choose an item from the list to view details.</span>
          </div>
        }

        @if (selectedProduct(); as p) {
          <!-- Cart confirmation toast -->
          @if (cartAdded()) {
            <div class="toast">
              ✅&nbsp;<strong>{{ p.name }}</strong>&nbsp;added to cart!
            </div>
          }

          <!-- Detail card -->
          <ui5-card>
            <ui5-card-header
              slot="header"
              [attr.title-text]="p.name"
              [attr.subtitle-text]="p.category"
            ></ui5-card-header>

            <div class="card-body">
              <!-- Product details -->
              <div class="detail-grid">
                <span class="detail-label">Product ID</span>
                <span class="detail-value">#{{ pad(p.id) }}</span>

                <span class="detail-label">Category</span>
                <span class="detail-value">{{ p.category }}</span>

                <span class="detail-label">Price</span>
                <span class="detail-value price-value">{{ formatPrice(p.price) }}</span>

                <span class="detail-label">Availability</span>
                <span class="detail-value">
                  <ui5-badge color-scheme="8">In Stock</ui5-badge>
                </span>
              </div>

              <!-- Add to Cart button -->
              <div class="cart-action">
                <ui5-button
                  design="Emphasized"
                  icon="cart"
                  (click)="addToCart(p)"
                >Add to Cart</ui5-button>
              </div>
            </div>
          </ui5-card>
        }

      </aside>
    </div>
  `,
})
export class ProductListPage {
  readonly products: Product[] = SAMPLE_PRODUCTS;

  selectedProduct = signal<Product | null>(null);
  cartAdded       = signal(false);

  private cartTimer: ReturnType<typeof setTimeout> | null = null;

  /** Category → UI5 Badge color-scheme */
  badgeColor(category: string): string {
    const map: Record<string, string> = {
      Electronics: '1',
      Furniture:   '6',
      Kitchen:     '3',
      Office:      '8',
    };
    return map[category] ?? '2';
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
  }

  pad(id: number): string {
    return id.toString().padStart(4, '0');
  }

  onSelectionChange(event: Event): void {
    const detail = (event as CustomEvent<{ selectedItems: HTMLElement[] }>).detail;
    const item   = detail?.selectedItems?.[0];
    if (!item) { this.selectedProduct.set(null); return; }

    const id    = Number(item.getAttribute('data-id'));
    const found = this.products.find((p) => p.id === id) ?? null;
    this.selectedProduct.set(found);
    this.cartAdded.set(false);
  }

  addToCart(_product: Product): void {
    this.cartAdded.set(true);
    if (this.cartTimer) clearTimeout(this.cartTimer);
    this.cartTimer = setTimeout(() => this.cartAdded.set(false), 3000);
  }
}
