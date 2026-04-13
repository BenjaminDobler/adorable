import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Ui5WebcomponentsMainModule } from '@ui5/webcomponents-ngx/main';
import { Ui5WebcomponentsFioriModule } from '@ui5/webcomponents-ngx/fiori';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';
import { SAMPLE_PRODUCTS, Product } from './sample-products';

setTheme('sap_horizon');

@Component({
  selector: 'app-product-list-page',
  standalone: true,
  imports: [CommonModule, Ui5WebcomponentsMainModule, Ui5WebcomponentsFioriModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background-color: var(--sapBackgroundColor, #f5f6f7);
      font-family: var(--sapFontFamily, '72', Arial, sans-serif);
    }

    .page-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      gap: var(--sapContent_Space_M, 1rem);
      padding: var(--sapContent_Space_M, 1rem);
    }

    .left-panel {
      flex: 0 0 60%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--sapList_Background, #fff);
      border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
      box-shadow: var(--sapContent_Shadow0, 0 0 0 0.0625rem rgba(0,0,0,.1));
    }

    .left-panel ui5-list {
      flex: 1;
      overflow-y: auto;
    }

    .right-panel {
      flex: 0 0 calc(40% - var(--sapContent_Space_M, 1rem));
      display: flex;
      flex-direction: column;
    }

    .right-panel ui5-card {
      flex: 1;
      border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
    }

    .card-content {
      padding: var(--sapContent_Space_M, 1rem);
      display: flex;
      flex-direction: column;
      gap: var(--sapContent_Space_S, 0.75rem);
    }

    .detail-row {
      display: flex;
      align-items: center;
      gap: var(--sapContent_Space_S, 0.75rem);
    }

    .detail-label {
      font-size: var(--sapFontSmallSize, 0.75rem);
      color: var(--sapContent_LabelColor, #556b82);
      min-width: 6rem;
    }

    .detail-value {
      font-size: var(--sapFontSize, 0.875rem);
      color: var(--sapTextColor, #1d2d3e);
      font-weight: 600;
    }

    .detail-description {
      font-size: var(--sapFontSize, 0.875rem);
      color: var(--sapTextColor, #1d2d3e);
      line-height: 1.5;
      margin-top: var(--sapContent_Space_XS, 0.5rem);
    }

    .card-footer {
      padding: var(--sapContent_Space_M, 1rem);
      border-top: var(--sapList_BorderWidth, 0.0625rem) solid var(--sapList_BorderColor, #e5e5e5);
      display: flex;
      justify-content: flex-end;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 0.5rem;
      color: var(--sapContent_LabelColor, #556b82);
      font-size: var(--sapFontSize, 0.875rem);
      padding: 2rem;
      text-align: center;
    }

    .empty-state ui5-icon {
      width: 3rem;
      height: 3rem;
      color: var(--sapContent_NonInteractiveIconColor, #8092a5);
    }

    .list-panel-header {
      padding: 0.75rem 1rem 0;
    }

    .search-box {
      width: 100%;
    }
  `],
  template: `
    <!-- ===== SHELLBAR ===== -->
    <ui5-shellbar
      primary-title="Product Catalog"
      secondary-title="SAP Horizon"
      show-notifications
      notifications-count="3"
      show-search-field>

      <ui5-input
        slot="searchField"
        placeholder="Search products…"
        show-clear-icon>
      </ui5-input>

      <ui5-avatar
        slot="profile"
        initials="JD"
        color-scheme="Accent6"
        accessible-name="John Doe – profile menu">
      </ui5-avatar>
    </ui5-shellbar>

    <!-- ===== BODY ===== -->
    <div class="page-body">

      <!-- LEFT: product list -->
      <div class="left-panel">
        <ui5-list
          header-text="Products ({{ products.length }})"
          selection-mode="Single"
          (selection-change)="onSelectionChange($event)">

          @for (product of products; track product.id) {
            <ui5-li
              [attr.data-id]="product.id"
              [attr.icon]="categoryIcon(product.category)"
              [attr.description]="product.category"
              [attr.additional-text]="'$' + product.price.toFixed(2)"
              additional-text-state="Information"
              [attr.selected]="selectedProduct()?.id === product.id ? true : null">
              {{ product.name }}
            </ui5-li>
          }
        </ui5-list>
      </div>

      <!-- RIGHT: detail card -->
      <div class="right-panel">
        @if (selectedProduct(); as p) {
          <ui5-card [attr.accessible-name]="p.name">
            <ui5-card-header
              slot="header"
              [attr.title-text]="p.name"
              [attr.subtitle-text]="p.category"
              [attr.additional-text]="'$' + p.price.toFixed(2)">
            </ui5-card-header>

            <div class="card-content">
              <div class="detail-row">
                <span class="detail-label">Product ID</span>
                <span class="detail-value">#{{ p.id }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Category</span>
                <span class="detail-value">{{ p.category }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Price</span>
                <span class="detail-value">{{'$' + p.price.toFixed(2)}}</span>
              </div>
              <p class="detail-description">{{ p.description }}</p>
            </div>

            <div class="card-footer">
              <ui5-button
                design="Emphasized"
                icon="cart"
                (click)="onAddToCart(p)">
                Add to Cart
              </ui5-button>
            </div>
          </ui5-card>
        } @else {
          <ui5-card accessible-name="Product detail">
            <ui5-card-header slot="header" title-text="Product Details"></ui5-card-header>
            <div class="empty-state">
              <ui5-icon name="product"></ui5-icon>
              <span>Select a product from the list<br>to view its details here.</span>
            </div>
          </ui5-card>
        }
      </div>

    </div>
  `
})
export class ProductListPage {
  readonly products: Product[] = SAMPLE_PRODUCTS;
  readonly selectedProduct = signal<Product | null>(null);

  onSelectionChange(event: CustomEvent): void {
    const selectedItems: HTMLElement[] = event.detail?.selectedItems ?? [];
    if (selectedItems.length === 0) {
      this.selectedProduct.set(null);
      return;
    }
    const id = Number((selectedItems[0] as HTMLElement).dataset['id']);
    this.selectedProduct.set(this.products.find(p => p.id === id) ?? null);
  }

  onAddToCart(product: Product): void {
    alert(`"${product.name}" has been added to your cart!`);
  }

  categoryIcon(category: string): string {
    const map: Record<string, string> = {
      Electronics: 'laptop',
      Furniture: 'table-view',
      Sports: 'soccer',
      Kitchen: 'nutrition-activity',
    };
    return map[category] ?? 'product';
  }
}
