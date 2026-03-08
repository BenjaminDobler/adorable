import { Component, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminAuthService } from './services/auth';
import { ThemeService, ThemeType, ThemeMode } from './services/theme';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  auth = inject(AdminAuthService);
  themeService = inject(ThemeService);

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.themePanelOpen()) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.theme-switcher-wrapper')) {
      this.themePanelOpen.set(false);
    }
  }

  email = '';
  password = '';
  loginError = '';
  loginLoading = false;

  themePanelOpen = signal(false);

  login() {
    this.loginLoading = true;
    this.loginError = '';
    this.auth.login(this.email, this.password).subscribe({
      next: (res) => {
        const ok = this.auth.handleLoginResponse(res);
        if (!ok) {
          this.loginError = 'This account does not have admin access.';
        }
        this.loginLoading = false;
      },
      error: (err) => {
        this.loginError = err.error?.error || 'Login failed';
        this.loginLoading = false;
      },
    });
  }

  toggleThemePanel() {
    this.themePanelOpen.update((v) => !v);
  }

  setThemeType(type: ThemeType) {
    this.themeService.setThemeType(type);
  }

  setThemeMode(mode: ThemeMode) {
    this.themeService.setThemeMode(mode);
  }
}
