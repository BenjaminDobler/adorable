import { Component, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { isDesktopApp } from '../../../core/services/smart-container.engine';

@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './cookie-banner.html',
  styleUrl: './cookie-banner.scss',
})
export class CookieBannerComponent {
  visible = signal(!isDesktopApp() && !localStorage.getItem('adorable_cookie_notice_dismissed'));

  dismiss() {
    localStorage.setItem('adorable_cookie_notice_dismissed', '1');
    this.visible.set(false);
  }
}
