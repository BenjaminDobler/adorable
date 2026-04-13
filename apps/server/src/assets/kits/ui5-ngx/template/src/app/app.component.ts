import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: var(--sapBackgroundColor, #f5f6f7);
      color: var(--sapTextColor, #131e29);
      font-family: var(--sapFontFamily, '72', '72full', Arial, Helvetica, sans-serif);
      font-size: var(--sapFontSize, 0.875rem);
    }
  `,
})
export class AppComponent {}
