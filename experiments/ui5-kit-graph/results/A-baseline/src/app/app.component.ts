import { Component } from '@angular/core';
import { ProductListPage } from './product-list-page.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ProductListPage],
  template: `<app-product-list-page />`,
})
export class AppComponent {}
