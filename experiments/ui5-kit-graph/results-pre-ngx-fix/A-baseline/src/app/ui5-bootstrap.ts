/**
 * Import all required UI5 Web Component registrations.
 * Import this file once in main.ts (or here) before bootstrapping Angular.
 *
 * Components used:
 *   - ui5-shellbar        → @ui5/webcomponents-fiori
 *   - ui5-list / ui5-li   → @ui5/webcomponents
 *   - ui5-card            → @ui5/webcomponents
 *   - ui5-button          → @ui5/webcomponents
 *   - ui5-avatar          → @ui5/webcomponents
 *   - ui5-input           → @ui5/webcomponents
 *   - ui5-icon            → @ui5/webcomponents
 *   - ui5-card-header     → @ui5/webcomponents
 */
import '@ui5/webcomponents-fiori/dist/ShellBar.js';
import '@ui5/webcomponents-fiori/dist/ShellBarItem.js';
import '@ui5/webcomponents/dist/List.js';
import '@ui5/webcomponents/dist/StandardListItem.js';
import '@ui5/webcomponents/dist/Card.js';
import '@ui5/webcomponents/dist/CardHeader.js';
import '@ui5/webcomponents/dist/Button.js';
import '@ui5/webcomponents/dist/Avatar.js';
import '@ui5/webcomponents/dist/Input.js';
import '@ui5/webcomponents/dist/Icon.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/cart.js';
import '@ui5/webcomponents-icons/dist/bell.js';
import '@ui5/webcomponents-icons/dist/customer.js';

// Set Horizon theme as default
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';
setTheme('sap_horizon');
