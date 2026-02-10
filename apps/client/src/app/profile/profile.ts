import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../services/api';
import { Router, ActivatedRoute } from '@angular/router';
import { ThemeService, ThemeType, ThemeMode, ThemeSettings, ThemeCombined } from '../services/theme';
import { ToastService } from '../services/toast';
import { GitHubService } from '../services/github.service';
import { isDesktopApp } from '../services/smart-container.engine';

export type ProviderType = 'anthropic' | 'gemini' | 'figma';
export type MCPAuthType = 'none' | 'bearer';
export type MCPTransport = 'http' | 'stdio';

export interface AIProfile {
  id: string;
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

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransport;
  // HTTP transport
  url?: string;
  authType?: MCPAuthType;
  apiKey?: string;
  // stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // Common
  enabled: boolean;
  lastError?: string;
}

export interface AppSettings {
  profiles: AIProfile[];
  activeProfileId: string;
  smartRouting?: SmartRoutingConfig;
  theme?: ThemeCombined; // Legacy: combined theme mode
  themeSettings?: ThemeSettings; // New: separate type and mode
  mcpServers?: MCPServerConfig[];
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfileComponent implements OnInit {
  private apiService = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public themeService = inject(ThemeService);
  private toastService = inject(ToastService);
  public githubService = inject(GitHubService);

  user = signal<any>(null);
  name = signal('');
  activeTab = signal<'account' | 'providers' | 'integrations' | 'mcp'>('account');

  // Detect if running in desktop mode (Electron)
  isDesktopMode = computed(() => isDesktopApp());

  // MCP Server management
  mcpServers = signal<MCPServerConfig[]>([]);
  editingMcpServer = signal<MCPServerConfig | null>(null);
  testingConnection = signal(false);
  connectionTestResult = signal<{success: boolean; error?: string; toolCount?: number} | null>(null);

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
      },
      {
        id: 'figma',
        name: 'Figma',
        provider: 'figma',
        apiKey: '',
        model: ''
      }
    ],
    activeProfileId: 'anthropic',
    smartRouting: {
      enabled: true,
      router: { provider: 'gemini', model: 'gemini-1.5-flash' },
      simple: { provider: 'gemini', model: 'gemini-1.5-flash' },
      complex: { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620' },
      vision: { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620' }
    },
    theme: 'dark',
    themeSettings: { type: 'standard', mode: 'dark' }
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

  ngOnInit() {
    // Check for GitHub OAuth callback result
    this.route.queryParams.subscribe(params => {
      if (params['github_connected'] === 'true') {
        this.toastService.show('GitHub account connected!', 'success');
        this.githubService.getConnection().subscribe();
      }
      if (params['github_error']) {
        this.toastService.show(`GitHub error: ${params['github_error']}`, 'error');
      }
    });

    // Load GitHub connection status
    this.githubService.getConnection().subscribe();
  }

  connectGitHub() {
    this.githubService.connect();
  }

  disconnectGitHub() {
    this.githubService.disconnect().subscribe({
      next: () => {
        this.toastService.show('GitHub disconnected', 'success');
      },
      error: (err) => {
        this.toastService.show('Failed to disconnect GitHub', 'error');
      }
    });
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

        // Load MCP servers
        const mcpServers = parsed.mcpServers || [];
        this.mcpServers.set(mcpServers);

        // Get current theme settings from ThemeService (which loads from localStorage)
        // Only override if server has explicit themeSettings saved
        let themeSettings: ThemeSettings;
        if (parsed.themeSettings) {
          // Server has new format - use it
          themeSettings = parsed.themeSettings;
          this.themeService.loadSettings(themeSettings);
        } else if (parsed.theme && parsed.theme !== 'dark') {
          // Server has old format with non-default value - migrate it
          const oldTheme = parsed.theme as ThemeCombined;
          if (oldTheme === 'pro-dark') {
            themeSettings = { type: 'pro', mode: 'dark' };
          } else if (oldTheme === 'pro-light') {
            themeSettings = { type: 'pro', mode: 'light' };
          } else if (oldTheme === 'light') {
            themeSettings = { type: 'standard', mode: 'light' };
          } else {
            themeSettings = { type: 'standard', mode: 'dark' };
          }
          this.themeService.loadSettings(themeSettings);
        } else {
          // No server settings or just default - use current ThemeService state (from localStorage)
          themeSettings = this.themeService.getSettings();
        }

        const newSettings: AppSettings = {
          profiles: mergedProfiles,
          activeProfileId: parsed.activeProfileId || 'anthropic',
          smartRouting: {
            ...this.settings().smartRouting!,
            ...(parsed.smartRouting || {})
          },
          theme: parsed.theme || 'dark',
          themeSettings,
          mcpServers
        };

        this.settings.set(newSettings);

        // Fetch models for AI profiles with keys (skip Figma)
        this.settings().profiles.forEach(p => {
          if (p.apiKey && p.provider !== 'figma') this.fetchModels(p);
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
    this.save();
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

  getFigmaProfile(): AIProfile | undefined {
    return this.settings().profiles.find(p => p.provider === 'figma');
  }

  getAIProfiles(): AIProfile[] {
    return this.settings().profiles.filter(p => p.provider !== 'figma');
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

  // MCP Server Management Methods
  addMcpServer() {
    const newServer: MCPServerConfig = {
      id: crypto.randomUUID(),
      name: 'New Server',
      transport: 'http',
      url: '',
      authType: 'none',
      enabled: true
    };
    this.editingMcpServer.set(newServer);
    this.connectionTestResult.set(null);
  }

  editMcpServer(server: MCPServerConfig) {
    this.editingMcpServer.set({ ...server });
    this.connectionTestResult.set(null);
  }

  cancelMcpEdit() {
    this.editingMcpServer.set(null);
    this.connectionTestResult.set(null);
  }

  testMcpConnection() {
    const server = this.editingMcpServer();
    if (!server) return;

    this.testingConnection.set(true);
    this.connectionTestResult.set(null);

    this.apiService.testMcpConnection({
      transport: server.transport || 'http',
      url: server.url,
      authType: server.authType,
      apiKey: server.apiKey,
      name: server.name,
      command: server.command,
      args: server.args,
      env: server.env
    }).subscribe({
      next: (result) => {
        this.connectionTestResult.set(result);
        this.testingConnection.set(false);
      },
      error: (err) => {
        this.connectionTestResult.set({
          success: false,
          error: err.error?.error || err.message || 'Connection failed'
        });
        this.testingConnection.set(false);
      }
    });
  }

  saveMcpServer() {
    const server = this.editingMcpServer();
    if (!server) return;

    const currentServers = this.mcpServers();
    const existingIndex = currentServers.findIndex(s => s.id === server.id);

    let updatedServers: MCPServerConfig[];
    if (existingIndex >= 0) {
      updatedServers = [...currentServers];
      updatedServers[existingIndex] = server;
    } else {
      updatedServers = [...currentServers, server];
    }

    this.mcpServers.set(updatedServers);
    this.settings.update(s => ({
      ...s,
      mcpServers: updatedServers
    }));

    this.editingMcpServer.set(null);
    this.connectionTestResult.set(null);

    // Auto-save to database
    this.save();
  }

  deleteMcpServer(id: string) {
    const updated = this.mcpServers().filter(s => s.id !== id);
    this.mcpServers.set(updated);
    this.settings.update(s => ({
      ...s,
      mcpServers: updated
    }));
    // Auto-save to database
    this.save();
  }

  toggleMcpServer(id: string) {
    const updated = this.mcpServers().map(s =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    this.mcpServers.set(updated);
    this.settings.update(s => ({
      ...s,
      mcpServers: updated
    }));
    // Auto-save to database
    this.save();
  }

  updateEditingMcpServer(updates: Partial<MCPServerConfig>) {
    const current = this.editingMcpServer();
    if (current) {
      this.editingMcpServer.set({ ...current, ...updates });
    }
  }

  // Helper methods for stdio transport
  formatEnvVars(env?: Record<string, string>): string {
    if (!env) return '';
    return Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
  }

  parseEnvVars(text: string): Record<string, string> {
    if (!text.trim()) return {};
    const result: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1);
        if (key) result[key] = value;
      }
    }
    return result;
  }

  formatArgs(args?: string[]): string {
    return args?.join(' ') || '';
  }

  parseArgs(text: string): string[] {
    return text ? text.split(' ').filter(a => a.trim()) : [];
  }
}
