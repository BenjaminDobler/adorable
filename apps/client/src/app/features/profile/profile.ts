import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api';
import { Router, ActivatedRoute } from '@angular/router';
import { ThemeService, ThemeType, ThemeMode, ThemeSettings } from '../../core/services/theme';
import { ToastService } from '../../core/services/toast';
import { GitHubService } from '../../core/services/github.service';
import { isDesktopApp } from '../../core/services/smart-container.engine';
import { CloudSyncService } from '../../core/services/cloud-sync.service';
import { CloudConnectComponent } from '../../shared/ui/cloud-connect/cloud-connect.component';
import { AppSettings, AIProfile, BuiltInToolConfig, SapAiCoreConfig, MCPServerConfig } from './profile.types';

import { AccountTabComponent } from './account-tab/account-tab.component';
import { ProvidersTabComponent } from './providers-tab/providers-tab.component';
import { IntegrationsTabComponent } from './integrations-tab/integrations-tab.component';
import { McpTabComponent } from './mcp-tab/mcp-tab.component';
import { AboutTabComponent } from './about-tab/about-tab.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    FormsModule,
    RouterModule,
    CloudConnectComponent,
    AccountTabComponent,
    ProvidersTabComponent,
    IntegrationsTabComponent,
    McpTabComponent,
    AboutTabComponent
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfileComponent implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private themeService = inject(ThemeService);
  private toastService = inject(ToastService);
  private githubService = inject(GitHubService);
  public cloudSyncService = inject(CloudSyncService);

  user = signal<any>(null);
  name = signal('');
  activeTab = signal<'account' | 'providers' | 'integrations' | 'mcp' | 'cloud' | 'about'>('account');

  legalBaseUrl = 'https://adorable.run';

  isDesktopMode = computed(() => isDesktopApp());

  mcpServers = signal<MCPServerConfig[]>([]);

  settings = signal<AppSettings>({
    profiles: [
      {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        provider: 'anthropic',
        apiKey: '',
        model: 'claude-sonnet-4-5-20250929'
      },
      {
        id: 'gemini',
        name: 'Google (Gemini)',
        provider: 'gemini',
        apiKey: '',
        model: 'gemini-2.5-flash'
      },
      {
        id: 'figma',
        name: 'Figma',
        provider: 'figma',
        apiKey: '',
        model: ''
      },
      {
        id: 'claude-code',
        name: 'Claude Code (Local)',
        provider: 'claude-code',
        apiKey: '',
        model: 'sonnet'
      }
    ],
    activeProfileId: 'anthropic',
    theme: 'dark',
    themeSettings: this.themeService.getSettings()
  });

  loading = signal(false);
  fetchedModels = signal<Record<string, string[]>>({});

  constructor() {
    this.loadData();
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['github_connected'] === 'true') {
        this.toastService.show('GitHub account connected!', 'success');
        this.githubService.getConnection().subscribe();
      }
      if (params['github_error']) {
        this.toastService.show(`GitHub error: ${params['github_error']}`, 'error');
      }
    });

    this.githubService.getConnection().subscribe();
  }

  loadData() {
    this.apiService.getProfile().subscribe(user => {
      this.user.set(user);
      this.name.set(user.name || '');

      if (user.settings) {
        let parsed = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;

        const defaultProfiles = this.settings().profiles;
        let profiles = parsed.profiles || [];

        if (!parsed.profiles && parsed.provider) {
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

        const mergedProfiles = defaultProfiles.map(def => {
          const loaded = profiles.find((p: any) => p.id === def.id || p.provider === def.provider);
          return loaded ? { ...def, ...loaded, id: def.id } : def;
        });

        const mcpServers = parsed.mcpServers || [];
        this.mcpServers.set(mcpServers);

        const themeSettings = this.themeService.getSettings();

        const newSettings: AppSettings = {
          profiles: mergedProfiles,
          activeProfileId: parsed.activeProfileId || 'anthropic',
          theme: parsed.theme || 'dark',
          themeSettings,
          mcpServers,
          angularMcpEnabled: parsed.angularMcpEnabled !== false,
          kitLessonsEnabled: parsed.kitLessonsEnabled !== false,
        };

        this.settings.set(newSettings);

        this.settings().profiles.forEach(p => {
          if (p.apiKey && p.provider !== 'figma' && p.provider !== 'claude-code') this.fetchModels(p);
        });
      }
    });
  }

  fetchModels(profile: AIProfile) {
    if (!profile.apiKey) return;

    let providerParam = profile.provider;
    if (providerParam === 'gemini') providerParam = 'google' as any;

    this.apiService.getModels(providerParam, profile.apiKey).subscribe({
      next: (models) => {
        this.fetchedModels.update(current => ({
          ...current,
          [profile.id]: models
        }));

        if (models.length > 0 && !profile.model) {
          this.updateProfile(profile.id, { model: models[0] });
        }
      },
      error: (err) => {
        console.error(`Failed to fetch models for ${profile.name}`, err);
      }
    });
  }

  // --- Handlers called from sub-component outputs ---

  onNameChange(newName: string) {
    this.name.set(newName);
  }

  onSetActive(id: string) {
    this.settings.update(s => ({
      ...s,
      activeProfileId: id
    }));
    this.save();
  }

  updateProfile(id: string, updates: Partial<AIProfile>) {
    this.settings.update(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === id ? { ...p, ...updates } : p)
    }));
  }

  onProfileUpdated(event: {id: string, updates: Partial<AIProfile>}) {
    this.updateProfile(event.id, event.updates);
  }

  onBuiltInToolToggled(event: {profileId: string, tool: keyof BuiltInToolConfig, enabled: boolean}) {
    const profile = this.settings().profiles.find(p => p.id === event.profileId);
    const current = profile?.builtInTools || {};
    this.updateProfile(event.profileId, { builtInTools: { ...current, [event.tool]: event.enabled } });
  }

  onSapModeToggled(event: {profileId: string, enabled: boolean}) {
    const profile = this.settings().profiles.find(p => p.id === event.profileId);
    const current = profile?.sapAiCore || { enabled: false, authUrl: '', clientId: '', clientSecret: '', resourceGroup: 'default' };
    this.updateProfile(event.profileId, { sapAiCore: { ...current, enabled: event.enabled } });
  }

  onSapConfigUpdated(event: {profileId: string, updates: Partial<SapAiCoreConfig>}) {
    const profile = this.settings().profiles.find(p => p.id === event.profileId);
    const current = profile?.sapAiCore || { enabled: false, authUrl: '', clientId: '', clientSecret: '', resourceGroup: 'default' };
    this.updateProfile(event.profileId, { sapAiCore: { ...current, ...event.updates } });
  }

  updateThemeType(type: ThemeType) {
    const newSettings: ThemeSettings = {
      ...this.settings().themeSettings!,
      type
    };
    this.settings.update(s => ({ ...s, themeSettings: newSettings }));
    this.themeService.setThemeType(type);
  }

  updateThemeMode(mode: ThemeMode) {
    const newSettings: ThemeSettings = {
      ...this.settings().themeSettings!,
      mode
    };
    this.settings.update(s => ({ ...s, themeSettings: newSettings }));
    this.themeService.setThemeMode(mode);
  }

  onMcpServersChange(servers: MCPServerConfig[]) {
    this.mcpServers.set(servers);
    this.settings.update(s => ({ ...s, mcpServers: servers }));
    this.save();
  }

  onAngularMcpToggle(enabled: boolean) {
    this.settings.update(s => ({ ...s, angularMcpEnabled: enabled }));
    this.save();
  }

  onKitLessonsToggle(enabled: boolean) {
    this.settings.update(s => ({ ...s, kitLessonsEnabled: enabled }));
    this.save();
  }

  onResearchAgentToggle(enabled: boolean) {
    this.settings.update(s => ({ ...s, researchAgentEnabled: enabled }));
    this.save();
  }

  onReviewAgentToggle(enabled: boolean) {
    this.settings.update(s => ({ ...s, reviewAgentEnabled: enabled }));
    this.save();
  }

  save() {
    this.loading.set(true);

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
        this.toastService.show('Profile and settings saved!', 'success');
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.toastService.show('Failed to save profile', 'error');
        this.loading.set(false);
      }
    });
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
