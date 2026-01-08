import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './navbar/navbar';
import { LayoutService } from './services/layout';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, NavbarComponent],
  template: `
    @if (!layoutService.isFullscreen()) {
      <app-navbar></app-navbar>
    }
    <router-outlet></router-outlet>
  `,
})
export class ShellComponent {
  public layoutService = inject(LayoutService);
}
