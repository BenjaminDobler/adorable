import { Component, EventEmitter, Output, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api';

export type ProviderType = 'anthropic' | 'gemini';

export interface AIProfile {
  id: string; // 'anthropic' | 'gemini'
  name: string;
  provider: ProviderType;
  apiKey: string;
  model: string;
}

export interface SmartRoutingTier {
  provider: ProviderType;
  model: string;
}

export interface SmartRoutingConfig {
  enabled: boolean;
  router: SmartRoutingTier;
  simple: SmartRoutingTier;
  complex: SmartRoutingTier;
  vision: SmartRoutingTier;
}

export interface AppSettings {
  profiles: AIProfile[];
  activeProfileId: string;
  smartRouting?: SmartRoutingConfig;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsComponent {
  private apiService = inject(ApiService);
  
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<AppSettings>();

  settings = signal<AppSettings>({
    profiles: [
      {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        provider: 'anthropic',
        apiKey: '',
        model: 'claude-3-5-sonnet-20240620'
      },
      {
        id: 'gemini',
        name: 'Google (Gemini)',
        provider: 'gemini',
        apiKey: '',
        model: 'gemini-2.0-flash-exp'
      }
    ],
    activeProfileId: 'anthropic',
    smartRouting: {
      enabled: true,
      router: { provider: 'gemini', model: 'gemini-1.5-flash' },
      simple: { provider: 'gemini', model: 'gemini-1.5-flash' },
      complex: { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620' },
      vision: { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620' }
    }
  });
  
  anthropicProfile = computed(() => this.settings().profiles.find(p => p.id === 'anthropic')!);
  geminiProfile = computed(() => this.settings().profiles.find(p => p.id === 'gemini')!);

  loading = signal(false);

  anthropicModels = [
    'claude-3-5-sonnet-20240620',
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229'
  ];

  geminiModels = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];

  constructor() {
    this.loadSettings();
  }

  loadSettings() {
    this.apiService.getProfile().subscribe(user => {
      if (user.settings) {
        let parsed = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
        
        // Ensure we have the base structure
        const defaultProfiles = this.settings().profiles;
        let profiles = parsed.profiles || [];

        // If legacy format
        if (!parsed.profiles && parsed.provider) {
           const legacyProfile = {
             id: parsed.provider,
             name: parsed.provider === 'anthropic' ? 'Anthropic (Claude)' : 'Google (Gemini)',
             provider: parsed.provider,
             apiKey: parsed.apiKey || '',
             model: parsed.model || ''
           };
           profiles = [legacyProfile];
           parsed.activeProfileId = parsed.provider;
        }

        // Merge loaded profiles with defaults to ensure both exist
        const mergedProfiles = defaultProfiles.map(def => {
          const loaded = profiles.find((p: any) => p.id === def.id || p.provider === def.provider);
          return loaded ? { ...def, ...loaded, id: def.id } : def; // Force ID consistency
        });

        this.settings.set({
          profiles: mergedProfiles,
          activeProfileId: parsed.activeProfileId || 'anthropic',
          smartRouting: {
            ...this.settings().smartRouting!,
            ...(parsed.smartRouting || {})
          }
        });
      }
    });
  }

  setActive(id: string) {
    this.settings.update(s => ({
      ...s,
      activeProfileId: id
    }));
  }

  updateProfile(id: string, updates: Partial<AIProfile>) {
    this.settings.update(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === id ? { ...p, ...updates } : p)
    }));
  }

  updateSmartRouting(updates: Partial<SmartRoutingConfig>) {
    this.settings.update(s => ({
      ...s,
      smartRouting: { ...s.smartRouting!, ...updates }
    }));
  }

  updateSmartRoutingTier(tier: keyof Omit<SmartRoutingConfig, 'enabled'>, updates: Partial<SmartRoutingTier>) {
    this.settings.update(s => ({
      ...s,
      smartRouting: {
        ...s.smartRouting!,
        [tier]: { ...s.smartRouting![tier], ...updates }
      }
    }));
  }

  getTierConfig(tier: string): SmartRoutingTier | undefined {
    return (this.settings().smartRouting as any)?.[tier];
  }

  saveSettings() {
    this.loading.set(true);
    this.apiService.updateProfile({ settings: this.settings() }).subscribe({
      next: (updatedUser) => {
        const parsed = typeof updatedUser.settings === 'string' ? JSON.parse(updatedUser.settings) : updatedUser.settings;
        this.save.emit(parsed);
        this.loading.set(false);
        this.close.emit();
      },
      error: (err) => {
        console.error('Failed to save settings', err);
        this.loading.set(false);
      }
    });
  }
}