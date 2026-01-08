import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './navbar/navbar';
import { LayoutService } from './services/layout';
import { ToastComponent } from './ui/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, NavbarComponent, ToastComponent],
  template: `
    @if (!layoutService.isFullscreen()) {
      <app-navbar></app-navbar>
    }
    <router-outlet></router-outlet>
    <app-toast></app-toast>
  `,
})
export class ShellComponent {
  public layoutService = inject(LayoutService);
}
