import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { AppSettings, AIProfile, BuiltInToolConfig, SapAiCoreConfig } from '../profile.types';

@Component({
  selector: 'app-providers-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './providers-tab.component.html',
  styleUrl: './providers-tab.component.scss',
})
export class ProvidersTabComponent {
  private apiService = inject(ApiService);

  settings = input.required<AppSettings>();
  fetchedModels = input<Record<string, string[]>>({});

  setActive = output<string>();
  profileUpdated = output<{id: string, updates: Partial<AIProfile>}>();
  builtInToolToggled = output<{profileId: string, tool: keyof BuiltInToolConfig, enabled: boolean}>();
  sapModeToggled = output<{profileId: string, enabled: boolean}>();
  sapConfigUpdated = output<{profileId: string, updates: Partial<SapAiCoreConfig>}>();
  fetchModelsRequested = output<AIProfile>();

  // Local test state
  testingProvider = signal<string | null>(null);
  providerTestResult = signal<Record<string, {success: boolean; message?: string; error?: string}>>({});

  anthropicModels = [
    'claude-sonnet-4-5-20250929',
    'claude-opus-4-6',
    'claude-haiku-4-5-20251001'
  ];

  geminiModels = [
    'gemini-2.5-flash',
    'gemini-2.5-pro'
  ];

  getAIProfiles(): AIProfile[] {
    return this.settings().profiles.filter(p => p.provider !== 'figma');
  }

  testProviderConnection(profile: AIProfile) {
    this.testingProvider.set(profile.id);
    this.providerTestResult.update(r => {
      const copy = { ...r };
      delete copy[profile.id];
      return copy;
    });

    this.apiService.testProviderConnection({
      provider: profile.provider,
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      sapAiCore: profile.sapAiCore,
    }).subscribe({
      next: (result) => {
        this.providerTestResult.update(r => ({ ...r, [profile.id]: result }));
        this.testingProvider.set(null);
      },
      error: (err) => {
        this.providerTestResult.update(r => ({
          ...r,
          [profile.id]: { success: false, error: err.error?.error || err.message || 'Connection failed' }
        }));
        this.testingProvider.set(null);
      }
    });
  }
}
