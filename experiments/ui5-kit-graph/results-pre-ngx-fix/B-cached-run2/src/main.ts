import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { ProductListPage } from './app/product-list-page.component';

bootstrapApplication(ProductListPage, appConfig).catch(console.error);
