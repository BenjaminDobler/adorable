import { Component, inject, computed, signal, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from './core/layout/navbar/navbar';
import { LayoutService } from './core/services/layout';
import { ThemeService } from './core/services/theme';
import { ProjectService } from './core/services/project';
import { ApiService } from './core/services/api';
import { ToastService } from './core/services/toast';
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
  private apiService = inject(ApiService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private ngZone = inject(NgZone);

  githubReleasesUrl = 'https://github.com/BenjaminDobler/adorable/releases/latest';
  private isDesktop = isDesktopApp();

  updateDownloading = signal(false);
  updatePercent = signal(0);

  private cleanupFns: (() => void)[] = [];

  showBlockedOverlay = computed(() => {
    return this.projectService.cloudEditorBlocked() === 'capacity' && !this.isDesktop;
  });

  // Nx app selection state (for open-folder menu command)
  showNxAppSelection = signal(false);
  nxApps = signal<{ name: string; root: string; configurations: string[]; defaultConfiguration?: string }[]>([]);
  pendingExternalPath = signal<string | null>(null);
  selectedNxConfiguration = signal<Record<string, string>>({});

  ngOnInit() {
    if (this.isDesktop) {
      this.listenForUpdateEvents();
      this.listenForMenuCommands();
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

  private listenForMenuCommands() {
    const api = (window as any).electronAPI;
    if (!api?.onMenuOpenFolder) return;

    this.cleanupFns.push(
      api.onMenuOpenFolder(() => {
        this.ngZone.run(() => this.openExternalProject());
      })
    );
  }

  async openExternalProject() {
    const folderPath = await (window as any).electronAPI?.openFolderDialog();
    if (!folderPath) return;
    this.apiService.openExternalProject(folderPath).subscribe({
      next: (result: any) => {
        if (result.needsAppSelection && result.apps) {
          this.nxApps.set(result.apps);
          this.pendingExternalPath.set(folderPath);
          const defaults: Record<string, string> = {};
          for (const app of result.apps) {
            if (app.defaultConfiguration) defaults[app.root] = app.defaultConfiguration;
          }
          this.selectedNxConfiguration.set(defaults);
          this.showNxAppSelection.set(true);
        } else if (result.id) {
          this.router.navigate(['/editor', result.id]);
        }
      },
      error: (err: any) => this.toastService.show(err.error?.error || 'Failed to open project', 'error'),
    });
  }

  selectNxApp(appRoot: string) {
    const folderPath = this.pendingExternalPath();
    if (!folderPath) return;
    this.showNxAppSelection.set(false);
    const config = this.selectedNxConfiguration()[appRoot];
    this.apiService.openExternalProject(folderPath, undefined, appRoot, config).subscribe({
      next: (project: any) => {
        if (project.id) this.router.navigate(['/editor', project.id]);
      },
      error: (err: any) => this.toastService.show(err.error?.error || 'Failed to open project', 'error'),
    });
  }

  setNxConfiguration(appRoot: string, config: string) {
    this.selectedNxConfiguration.update(m => ({ ...m, [appRoot]: config }));
  }

  cancelNxAppSelection() {
    this.showNxAppSelection.set(false);
    this.pendingExternalPath.set(null);
  }
}
