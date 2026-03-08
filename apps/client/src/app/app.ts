import { Component, inject, computed, signal, OnInit, OnDestroy, NgZone } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './core/layout/navbar/navbar';
import { LayoutService } from './core/services/layout';
import { ThemeService } from './core/services/theme';
import { ProjectService } from './core/services/project';
import { ToastComponent } from './shared/ui/toast/toast.component';
import { ConfirmDialogComponent } from './shared/ui/confirm-dialog/confirm-dialog.component';
import { CookieBannerComponent } from './pages/legal/cookie-banner/cookie-banner';
import { isDesktopApp } from './core/services/smart-container.engine';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, NavbarComponent, ToastComponent, ConfirmDialogComponent, CookieBannerComponent, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  public layoutService = inject(LayoutService);
  public themeService = inject(ThemeService); // Triggers constructor effect
  public projectService = inject(ProjectService);
  private ngZone = inject(NgZone);

  githubReleasesUrl = 'https://github.com/BenjaminDobler/adorable/releases/latest';
  private isDesktop = isDesktopApp();

  updateDownloading = signal(false);
  updatePercent = signal(0);

  private cleanupFns: (() => void)[] = [];

  showBlockedOverlay = computed(() => {
    return this.projectService.cloudEditorBlocked() === 'capacity' && !this.isDesktop;
  });

  ngOnInit() {
    if (this.isDesktop) {
      this.listenForUpdateEvents();
    }
  }

  ngOnDestroy() {
    this.cleanupFns.forEach((fn) => fn());
  }

  private listenForUpdateEvents() {
    const api = (window as any).electronAPI;
    if (!api?.onUpdateDownloadProgress) return;

    this.cleanupFns.push(
      api.onUpdateDownloadStarted(() => {
        this.ngZone.run(() => {
          this.updateDownloading.set(true);
          this.updatePercent.set(0);
        });
      }),
      api.onUpdateDownloadProgress((progress: { percent: number }) => {
        this.ngZone.run(() => {
          this.updatePercent.set(progress.percent);
        });
      }),
      api.onUpdateDownloaded(() => {
        this.ngZone.run(() => {
          this.updateDownloading.set(false);
        });
      })
    );
  }

  dismissOverlay() {
    this.projectService.cloudEditorBlocked.set(null);
  }
}
