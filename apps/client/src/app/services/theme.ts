import { Injectable, signal, effect, computed } from '@angular/core';

export type ThemeType = 'standard' | 'pro';
export type ThemeMode = 'dark' | 'light' | 'auto';

// Combined theme mode for backward compatibility
export type ThemeCombined = 'dark' | 'light' | 'pro-dark' | 'pro-light';

export interface ThemeSettings {
  type: ThemeType;
  mode: ThemeMode;
}

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private mediaQuery: MediaQueryList;

  // Store theme type and mode separately
  public themeType = signal<ThemeType>(this.loadThemeType());
  public themeMode = signal<ThemeMode>(this.loadThemeMode());

  // Computed: resolved mode (handles 'auto' by checking system preference)
  public resolvedMode = computed(() => {
    const mode = this.themeMode();
    if (mode === 'auto') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return mode;
  });

  // Computed: combined theme string for backward compatibility
  public mode = computed<ThemeCombined>(() => {
    const type = this.themeType();
    const resolved = this.resolvedMode();

    if (type === 'pro') {
      return resolved === 'dark' ? 'pro-dark' : 'pro-light';
    }
    return resolved;
  });

  // Track system preference
  private systemPrefersDark = signal(false);

  constructor() {
    // Set up system preference detection
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemPrefersDark.set(this.mediaQuery.matches);

    // Listen for system preference changes
    this.mediaQuery.addEventListener('change', (e) => {
      this.systemPrefersDark.set(e.matches);
    });

    // Apply theme whenever settings change
    effect(() => {
      const type = this.themeType();
      const mode = this.themeMode();
      const resolved = this.resolvedMode();

      // Save to localStorage
      localStorage.setItem('theme_type', type);
      localStorage.setItem('theme_mode', mode);

      // Apply to DOM
      this.applyTheme(type, resolved);
    });
  }

  private loadThemeType(): ThemeType {
    const saved = localStorage.getItem('theme_type');
    if (saved === 'pro') return 'pro';

    // Migration: check old theme_mode for pro themes
    const oldMode = localStorage.getItem('theme_mode');
    if (oldMode === 'pro-dark' || oldMode === 'pro-light') {
      return 'pro';
    }

    return 'pro';
  }

  private loadThemeMode(): ThemeMode {
    const saved = localStorage.getItem('theme_mode');

    // Handle old format migration
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

  // Legacy method for backward compatibility
  setTheme(combined: ThemeCombined) {
    switch (combined) {
      case 'dark':
        this.themeType.set('standard');
        this.themeMode.set('dark');
        break;
      case 'light':
        this.themeType.set('standard');
        this.themeMode.set('light');
        break;
      case 'pro-dark':
        this.themeType.set('pro');
        this.themeMode.set('dark');
        break;
      case 'pro-light':
        this.themeType.set('pro');
        this.themeMode.set('light');
        break;
    }
  }

  // Get settings object for saving
  getSettings(): ThemeSettings {
    return {
      type: this.themeType(),
      mode: this.themeMode()
    };
  }

  // Load settings from saved data
  loadSettings(settings: ThemeSettings) {
    if (settings.type) this.themeType.set(settings.type);
    if (settings.mode) this.themeMode.set(settings.mode);
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
