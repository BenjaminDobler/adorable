import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api';
import { Router } from '@angular/router';

export interface AppSettings {
  provider: 'anthropic' | 'gemini';
  apiKey: string;
  model: string;
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
    provider: 'anthropic',
    apiKey: '',
    model: ''
  });

  loading = signal(false);
  availableModels = signal<string[]>([]);

  anthropicModels = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022'
  ];

  geminiModels = [
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.0-pro'
  ];

  constructor() {
    this.loadData();
  }

  loadData() {
    this.apiService.getProfile().subscribe(user => {
      this.user.set(user);
      this.name.set(user.name || '');
      
      if (user.settings) {
        const parsed = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
        this.settings.set({
          provider: parsed.provider || 'anthropic',
          apiKey: parsed.apiKey || '',
          model: parsed.model || ''
        });
        this.fetchModels();
      }
    });
  }

  fetchModels() {
    const s = this.settings();
    if (!s.apiKey || !s.provider) {
        // Use defaults if no key
        this.updateAvailableModelsFromDefaults();
        return;
    }

    let provider = s.provider;
    if (provider === 'gemini') provider = 'google';

    this.apiService.getModels(provider, s.apiKey).subscribe({
      next: (models) => {
        this.availableModels.set(models);
        // If current model is not in list, select first (if list not empty)
        if (s.model && !models.includes(s.model) && models.length > 0) {
           // Maybe don't auto-switch if user has a custom model not in list? 
           // But usually list is authoritative.
           // Let's keep it unless empty.
        }
        if (!s.model && models.length > 0) {
            this.settings.update(curr => ({ ...curr, model: models[0] }));
        }
      },
      error: (err) => {
        console.error('Failed to fetch models', err);
        this.updateAvailableModelsFromDefaults();
      }
    });
  }

  updateAvailableModelsFromDefaults() {
      const s = this.settings();
      if (s.provider === 'anthropic') this.availableModels.set(this.anthropicModels);
      else if (s.provider === 'gemini' || s.provider === 'google') this.availableModels.set(this.geminiModels);
  }

  onProviderChange() {
      this.settings.update(s => ({ ...s, model: '' })); // Reset model
      this.fetchModels();
  }

  save() {
    this.loading.set(true);
    const data = {
      name: this.name(),
      settings: this.settings()
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
