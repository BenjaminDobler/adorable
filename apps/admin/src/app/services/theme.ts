import { Injectable, signal, effect, computed } from '@angular/core';

export type ThemeType = 'standard' | 'pro';
export type ThemeMode = 'dark' | 'light' | 'auto';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private mediaQuery: MediaQueryList;

  public themeType = signal<ThemeType>(this.loadThemeType());
  public themeMode = signal<ThemeMode>(this.loadThemeMode());

  public resolvedMode = computed(() => {
    const mode = this.themeMode();
    if (mode === 'auto') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return mode;
  });

  public mode = computed(() => {
    const type = this.themeType();
    const resolved = this.resolvedMode();
    if (type === 'pro') {
      return resolved === 'dark' ? 'pro-dark' : 'pro-light';
    }
    return resolved;
  });

  private systemPrefersDark = signal(false);

  constructor() {
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemPrefersDark.set(this.mediaQuery.matches);

    this.mediaQuery.addEventListener('change', (e) => {
      this.systemPrefersDark.set(e.matches);
    });

    effect(() => {
      const type = this.themeType();
      const mode = this.themeMode();
      const resolved = this.resolvedMode();

      localStorage.setItem('theme_type', type);
      localStorage.setItem('theme_mode', mode);

      this.applyTheme(type, resolved);
    });
  }

  private loadThemeType(): ThemeType {
    const saved = localStorage.getItem('theme_type');
    if (saved === 'standard' || saved === 'pro') return saved;
    return 'pro';
  }

  private loadThemeMode(): ThemeMode {
    const saved = localStorage.getItem('theme_mode');
    if (saved === 'pro-dark' || saved === 'dark') return 'dark';
    if (saved === 'pro-light' || saved === 'light') return 'light';
    if (saved === 'auto') return 'auto';
    return 'dark';
  }

  setThemeType(type: ThemeType) {
    this.themeType.set(type);
  }

  setThemeMode(mode: ThemeMode) {
    this.themeMode.set(mode);
  }

  private applyTheme(type: ThemeType, resolvedMode: 'dark' | 'light') {
    document.body.classList.remove('light-mode', 'pro-mode', 'pro-light-mode');

    if (type === 'standard') {
      if (resolvedMode === 'light') {
        document.body.classList.add('light-mode');
      }
    } else if (type === 'pro') {
      document.body.classList.add('pro-mode');
      if (resolvedMode === 'light') {
        document.body.classList.add('pro-light-mode');
      }
    }
  }
}
