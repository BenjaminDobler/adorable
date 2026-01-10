import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api';
import { Router } from '@angular/router';

export type ProviderType = 'anthropic' | 'gemini';

export interface AIProfile {
  id: string;
  name: string;
  provider: ProviderType;
  apiKey: string;
  model: string;
}

export interface AppSettings {
  profiles: AIProfile[];
  activeProfileId: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfileComponent {
  private apiService = inject(ApiService);
  private router = inject(Router);

  user = signal<any>(null);
  name = signal('');
  
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
    activeProfileId: 'anthropic'
  });

  loading = signal(false);

  fetchedModels = signal<Record<string, string[]>>({});

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
    this.loadData();
  }

  loadData() {
    this.apiService.getProfile().subscribe(user => {
      this.user.set(user);
      this.name.set(user.name || '');
      
      if (user.settings) {
        let parsed = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
        
        const defaultProfiles = this.settings().profiles;
        let profiles = parsed.profiles || [];

        // Legacy migration
        if (!parsed.profiles && parsed.provider) {
           // Normalize provider name 'google' -> 'gemini'
           let pName = parsed.provider;
           if (pName === 'google') pName = 'gemini';

           const legacyProfile = {
             id: pName,
             name: pName === 'anthropic' ? 'Anthropic (Claude)' : 'Google (Gemini)',
             provider: pName,
             apiKey: parsed.apiKey || '',
             model: parsed.model || ''
           };
           profiles = [legacyProfile];
           parsed.activeProfileId = pName;
        }

        // Merge
        const mergedProfiles = defaultProfiles.map(def => {
          const loaded = profiles.find((p: any) => p.id === def.id || p.provider === def.provider);
          return loaded ? { ...def, ...loaded, id: def.id } : def;
        });

        this.settings.set({
          profiles: mergedProfiles,
          activeProfileId: parsed.activeProfileId || 'anthropic'
        });

        // Fetch models for profiles with keys
        this.settings().profiles.forEach(p => {
          if (p.apiKey) this.fetchModels(p);
        });
      }
    });
  }

  fetchModels(profile: AIProfile) {
    if (!profile.apiKey) return;
    
    // Map provider to backend expected string if needed
    let providerParam = profile.provider;
    if (providerParam === 'gemini') providerParam = 'google' as any; // Backend expects 'google' for gemini

    this.apiService.getModels(providerParam, profile.apiKey).subscribe({
      next: (models) => {
        this.fetchedModels.update(current => ({
          ...current,
          [profile.id]: models
        }));
        
        // Auto-select first if current model is invalid/empty?
        // Let's be careful not to overwrite user choice if valid.
        if (models.length > 0 && !profile.model) {
           this.updateProfile(profile.id, { model: models[0] });
        }
      },
      error: (err) => {
        console.error(`Failed to fetch models for ${profile.name}`, err);
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

  save() {
    this.loading.set(true);
    
    // Validate active profile
    const current = this.settings();
    if (!current.profiles.find(p => p.id === current.activeProfileId)) {
       current.activeProfileId = current.profiles[0]?.id;
    }

    const data = {
      name: this.name(),
      settings: current
    };

    this.apiService.updateProfile(data).subscribe({
      next: () => {
        alert('Profile and settings saved!');
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        alert('Failed to save profile');
        this.loading.set(false);
      }
    });
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
