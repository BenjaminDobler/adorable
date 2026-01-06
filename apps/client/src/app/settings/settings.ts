import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<AppSettings>();

  settings = signal<AppSettings>({
    provider: 'anthropic',
    apiKey: '',
    model: ''
  });

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
    // Load from local storage
    const stored = localStorage.getItem('adorable-settings');
    if (stored) {
      this.settings.set(JSON.parse(stored));
    }
  }

  saveSettings() {
    localStorage.setItem('adorable-settings', JSON.stringify(this.settings()));
    this.save.emit(this.settings());
    this.close.emit();
  }
}