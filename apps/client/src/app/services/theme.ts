import { Injectable, signal, effect } from '@angular/core';

export type ThemeMode = 'dark' | 'light';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  public mode = signal<ThemeMode>((localStorage.getItem('theme_mode') as ThemeMode) || 'dark');

  constructor() {
    effect(() => {
      const currentMode = this.mode();
      localStorage.setItem('theme_mode', currentMode);
      this.applyTheme(currentMode);
    });
  }

  setTheme(mode: ThemeMode) {
    this.mode.set(mode);
  }

  private applyTheme(mode: ThemeMode) {
    if (mode === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }
}
