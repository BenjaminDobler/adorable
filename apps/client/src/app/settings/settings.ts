import { Component, EventEmitter, Output, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api';

export type ProviderType = 'anthropic' | 'gemini';
export type MCPAuthType = 'none' | 'bearer';

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

export interface MCPServerConfig {
  id: string;
  name: string;
  url: string;
  authType: MCPAuthType;
  apiKey?: string;
  enabled: boolean;
  lastError?: string;
}

export interface AppSettings {
  profiles: AIProfile[];
  activeProfileId: string;
  smartRouting?: SmartRoutingConfig;
  mcpServers?: MCPServerConfig[];
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
  fetchedModels = signal<Record<string, string[]>>({});

  // Tab navigation
  activeTab = signal<'providers' | 'mcp'>('providers');

  // MCP Server management
  mcpServers = signal<MCPServerConfig[]>([]);
  editingMcpServer = signal<MCPServerConfig | null>(null);
  testingConnection = signal(false);
  connectionTestResult = signal<{success: boolean; error?: string; toolCount?: number} | null>(null);

  // Fallback defaults if fetch fails
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

        // Load MCP servers
        const mcpServers = parsed.mcpServers || [];
        this.mcpServers.set(mcpServers);

        this.settings.set({
          profiles: mergedProfiles,
          activeProfileId: parsed.activeProfileId || 'anthropic',
          smartRouting: {
            ...this.settings().smartRouting!,
            ...(parsed.smartRouting || {})
          },
          mcpServers
        });

        // Fetch models
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
    if (providerParam === 'gemini') providerParam = 'google' as any;

    this.apiService.getModels(providerParam, profile.apiKey).subscribe({
      next: (models) => {
        this.fetchedModels.update(current => ({
          ...current,
          [profile.id]: models
        }));
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

  // Tab navigation
  setActiveTab(tab: 'providers' | 'mcp') {
    this.activeTab.set(tab);
  }

  // MCP Server Management Methods
  addMcpServer() {
    const newServer: MCPServerConfig = {
      id: crypto.randomUUID(),
      name: 'New Server',
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
      url: server.url,
      authType: server.authType,
      apiKey: server.apiKey,
      name: server.name
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

    if (existingIndex >= 0) {
      // Update existing
      const updated = [...currentServers];
      updated[existingIndex] = server;
      this.mcpServers.set(updated);
    } else {
      // Add new
      this.mcpServers.set([...currentServers, server]);
    }

    // Update settings
    this.settings.update(s => ({
      ...s,
      mcpServers: this.mcpServers()
    }));

    this.editingMcpServer.set(null);
    this.connectionTestResult.set(null);
  }

  deleteMcpServer(id: string) {
    const updated = this.mcpServers().filter(s => s.id !== id);
    this.mcpServers.set(updated);
    this.settings.update(s => ({
      ...s,
      mcpServers: updated
    }));
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
  }

  updateEditingMcpServer(updates: Partial<MCPServerConfig>) {
    const current = this.editingMcpServer();
    if (current) {
      this.editingMcpServer.set({ ...current, ...updates });
    }
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