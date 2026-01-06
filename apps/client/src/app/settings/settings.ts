import { Component, EventEmitter, Output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api';

export interface AppSettings {
  provider: 'anthropic' | 'gemini';
  apiKey: string;
  model: string;
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
    provider: 'anthropic',
    apiKey: '',
    model: ''
  });

  loading = signal(false);

  anthropicModels = [
    'claude-sonnet-4-5-20250929',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022'
  ];

  geminiModels = [
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.0-pro'
  ];

  constructor() {
    this.loadSettings();
  }

  loadSettings() {
    this.apiService.getProfile().subscribe(user => {
      if (user.settings) {
        const parsed = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
        this.settings.set({
          provider: parsed.provider || 'anthropic',
          apiKey: parsed.apiKey || '',
          model: parsed.model || ''
        });
      }
    });
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