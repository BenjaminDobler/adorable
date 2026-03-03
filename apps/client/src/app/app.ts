import { Component, inject, computed } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './navbar/navbar';
import { LayoutService } from './services/layout';
import { ThemeService } from './services/theme';
import { ProjectService } from './services/project';
import { ToastComponent } from './ui/toast/toast.component';
import { ConfirmDialogComponent } from './ui/confirm-dialog/confirm-dialog.component';
import { isDesktopApp } from './services/smart-container.engine';

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

    @if (showBlockedOverlay()) {
      <div class="blocked-overlay-backdrop" (click)="dismissOverlay()"></div>
      <div class="blocked-overlay">
        <button class="blocked-close" (click)="dismissOverlay()">&times;</button>
        @if (projectService.cloudEditorBlocked() === 'capacity') {
          <h2>Server at Capacity</h2>
          <p>All cloud editor slots are currently in use. You can try again in a few minutes, or download the desktop app for unlimited local usage.</p>
        } @else {
          <h2>Cloud Editor Access Restricted</h2>
          <p>Your account does not have cloud editor access. Contact an administrator, or download the desktop app to build locally.</p>
        }
        <div class="download-options">
          <a class="download-card" [href]="githubReleasesUrl" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <strong>macOS</strong>
            <span>.dmg installer</span>
          </a>
          <a class="download-card" [href]="githubReleasesUrl" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
            </svg>
            <strong>Windows</strong>
            <span>.exe installer</span>
          </a>
          <a class="download-card" [href]="githubReleasesUrl" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M12.504 0c-.155 0-.311.015-.466.046-3.125.635-3.361 4.594-1.962 7.278 1.116 2.143.793 4.203-.313 5.521-1.054 1.255-2.834 1.774-4.463 1.225-1.629-.549-3.009-1.915-3.36-3.636-.272-1.336.186-2.757.99-3.819.803-1.062 1.898-1.853 2.997-2.465a.5.5 0 0 0-.51-.865c-1.26.698-2.516 1.612-3.468 2.873-.952 1.261-1.52 2.93-1.187 4.548C1.138 12.69 2.88 14.4 4.93 15.09c2.049.69 4.302.027 5.666-1.599 1.364-1.626 1.718-4.149.397-6.683-1.167-2.239-1.034-5.415 1.51-5.931.154-.031.312-.048.471-.048 2.135 0 3.531 2.127 3.531 4.215 0 .766-.063 1.562-.252 2.273-.376 1.418-1.188 2.585-2.15 3.547-.964.963-2.098 1.741-3.201 2.404a.5.5 0 0 0 .51.865c1.142-.688 2.358-1.539 3.438-2.617 1.08-1.078 2.019-2.404 2.473-4.12.228-.858.302-1.754.302-2.618C17.625 2.547 15.564 0 12.504 0z"/>
            </svg>
            <strong>Linux</strong>
            <span>AppImage</span>
          </a>
        </div>
        <p class="overlay-footer">All downloads available on the <a [href]="githubReleasesUrl" target="_blank" rel="noopener">GitHub Releases page</a></p>
      </div>
    }
  `,
  styles: [`
    .blocked-overlay-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 10000;
    }
    .blocked-overlay {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #1e1e2e;
      border: 1px solid #2e2e3e;
      border-radius: 12px;
      padding: 2rem;
      z-index: 10001;
      max-width: 520px;
      width: 90%;
      text-align: center;
    }
    .blocked-overlay h2 {
      margin: 0 0 0.75rem;
      font-size: 1.25rem;
      color: #e0e0e0;
    }
    .blocked-overlay p {
      color: #999;
      font-size: 0.9rem;
      line-height: 1.5;
      margin: 0 0 1.25rem;
    }
    .blocked-close {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      background: none;
      border: none;
      color: #888;
      font-size: 1.5rem;
      cursor: pointer;
      line-height: 1;
    }
    .blocked-close:hover { color: #ccc; }
    .download-options {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
      margin-bottom: 1rem;
    }
    .download-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.375rem;
      padding: 1rem 1.25rem;
      background: #16161e;
      border: 1px solid #2e2e3e;
      border-radius: 8px;
      color: #ccc;
      text-decoration: none;
      transition: border-color 0.2s;
      min-width: 100px;
    }
    .download-card:hover {
      border-color: #3b82f6;
      color: #fff;
    }
    .download-card strong { font-size: 0.9rem; }
    .download-card span { font-size: 0.75rem; color: #888; }
    .overlay-footer {
      font-size: 0.8rem;
      color: #666;
      margin: 0;
    }
    .overlay-footer a { color: #3b82f6; text-decoration: none; }
    .overlay-footer a:hover { text-decoration: underline; }
  `],
})
export class AppComponent {
  public layoutService = inject(LayoutService);
  public themeService = inject(ThemeService); // Triggers constructor effect
  public projectService = inject(ProjectService);

  githubReleasesUrl = 'https://github.com/BenjaminDobler/adorable/releases/latest';
  private isDesktop = isDesktopApp();

  showBlockedOverlay = computed(() => {
    return this.projectService.cloudEditorBlocked() !== null && !this.isDesktop;
  });

  dismissOverlay() {
    this.projectService.cloudEditorBlocked.set(null);
  }
}
