import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './navbar/navbar';
import { LayoutService } from './services/layout';
import { ThemeService } from './services/theme';
import { ToastComponent } from './ui/toast/toast.component';
import { ConfirmDialogComponent } from './ui/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, NavbarComponent, ToastComponent, ConfirmDialogComponent],
  template: `
    @if (!layoutService.isFullscreen()) {
      <app-navbar></app-navbar>
    }
    <router-outlet></router-outlet>
    <app-toast></app-toast>
    <app-confirm-dialog></app-confirm-dialog>
  `,
})
export class AppComponent {
  public layoutService = inject(LayoutService);
  public themeService = inject(ThemeService); // Triggers constructor effect
}
