import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Set SAP Horizon theme before bootstrap
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';
setTheme('sap_horizon');

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
