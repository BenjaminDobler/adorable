import { Component, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth';
import { getServerUrl } from '../../services/server-url';
import { ThemeService, ThemeType, ThemeMode } from '../../services/theme';
import { ProjectService } from '../../services/project';
import { ContainerEngine } from '../../services/container-engine';
import { FormsModule } from '@angular/forms';
import { SmartContainerEngine, isDesktopApp } from '../../services/smart-container.engine';
import { GitHubService } from '../../services/github.service';
import { CloudSyncService } from '../../services/cloud-sync.service';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';
import { CloudConnectComponent } from '../../../shared/ui/cloud-connect/cloud-connect.component';
import { PopoverComponent } from '../../../shared/ui/popover/popover.component';
import { ProvidersTabComponent } from '../../../features/profile/providers-tab/providers-tab.component';
import { AccountTabComponent } from '../../../features/profile/account-tab/account-tab.component';
import { IntegrationsTabComponent } from '../../../features/profile/integrations-tab/integrations-tab.component';
import { McpTabComponent } from '../../../features/profile/mcp-tab/mcp-tab.component';
import { AboutTabComponent } from '../../../features/profile/about-tab/about-tab.component';
import { GitHubRepository, GitHubProjectSync, PublishVisibility } from '@adorable/shared-types';
import { ApiService } from '../../services/api';
import { AppSettings, AIProfile, BuiltInToolConfig, SapAiCoreConfig, MCPServerConfig } from '../../../features/profile/profile.types';
import { ThemeSettings } from '../../services/theme';
import { svgIcon } from '../../../shared/ui/icons';

interface ContainerInfo {
  containerId: string;
  containerName: string;
  hostProjectPath: string;
  containerWorkDir: string;
  status: string;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterModule, FormsModule, CloudConnectComponent, PopoverComponent, ProvidersTabComponent, AccountTabComponent, IntegrationsTabComponent, McpTabComponent, AboutTabComponent],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class NavbarComponent {
  private destroyRef = inject(DestroyRef);
  public authService = inject(AuthService);
  public projectService = inject(ProjectService);
  public containerEngine = inject(ContainerEngine);
  public githubService = inject(GitHubService);
  public cloudSyncService = inject(CloudSyncService);
  public themeService = inject(ThemeService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private router = inject(Router);
  private http = inject(HttpClient);

  // Desktop download
  desktopDownloadOpen = signal(false);
  githubReleasesUrl = 'https://github.com/BenjaminDobler/adorable/releases/latest';

  // Cloud panel
  cloudPanelOpen = signal(false);

  // VS Code integration
  vscodePanelOpen = signal(false);

  // Theme switcher
  themePanelOpen = signal(false);

  // GitHub sync state
  githubPanelOpen = signal(false);
  githubSyncStatus = signal<GitHubProjectSync | null>(null);
  githubRepos = signal<GitHubRepository[]>([]);
  githubSelectedRepo = signal<string>('');
  githubSyncing = signal(false);
  githubNewRepoName = signal('');
  githubCreateMode = signal(false);
  githubPagesUrl = signal<string | null>(null);
  githubPagesDeploying = signal(false);

  // Publish panel
  publishPanelOpen = signal(false);
  publishVisibility = signal<PublishVisibility>('public');
  publishTarget = signal<'local' | 'cloud'>('cloud');
  private apiService = inject(ApiService);

  // Agent Mode - available in Docker and Native modes
  isDockerMode = computed(() => this.containerEngine.mode() === 'local');
  isDesktop = isDesktopApp();

  constructor() {
    // Load GitHub connection status on startup
    this.githubService.getConnection().pipe(takeUntilDestroyed()).subscribe();
  }

  isProjectView() {
    return this.router.url.startsWith('/editor/');
  }

  logout() {
    this.authService.logout();
  }

  isNativeMode = computed(() => this.containerEngine.mode() === 'native');

  toggleEngine(event: Event) {
    const select = event.target as HTMLSelectElement;
    if (this.containerEngine instanceof SmartContainerEngine) {
       this.containerEngine.setMode(select.value as 'local' | 'native');
       this.projectService.reloadPreview(this.projectService.files());
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  // GitHub Methods
  get isGitHubConnected(): boolean {
    return this.githubService.connection().connected;
  }

  get hasProject(): boolean {
    return this.projectService.hasProject();
  }

  toggleGitHubPanel() {
    const isOpen = !this.githubPanelOpen();
    this.githubPanelOpen.set(isOpen);

    if (isOpen && this.hasProject) {
      this.loadGitHubSyncStatus();
      if (this.isGitHubConnected && this.githubRepos().length === 0) {
        this.loadGitHubRepos();
      }
    }
  }

  loadGitHubSyncStatus() {
    const projectId = this.projectService.projectId();
    if (!projectId || !this.projectService.isSaved()) return;

    this.githubService.getSyncStatus(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (status) => {
        this.githubSyncStatus.set(status);
        if (status.enabled) {
          this.loadGitHubPagesStatus();
        }
      },
      error: () => this.githubSyncStatus.set(null)
    });
  }

  loadGitHubRepos() {
    this.githubService.listRepositories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (repos) => this.githubRepos.set(repos),
      error: (err) => {
        console.error('Failed to load repos:', err);
        this.toastService.show('Failed to load GitHub repositories', 'error');
      }
    });
  }

  connectToGitHubRepo() {
    const projectId = this.projectService.projectId();
    const repoFullName = this.githubSelectedRepo();

    if (!projectId || !repoFullName) return;

    this.githubSyncing.set(true);
    this.githubService.connectProject(projectId, repoFullName).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.toastService.show(`Connected to ${res.repoFullName}`, 'success');
        this.loadGitHubSyncStatus();
        this.githubSyncing.set(false);
      },
      error: (err) => {
        console.error('Failed to connect:', err);
        this.toastService.show('Failed to connect to repository', 'error');
        this.githubSyncing.set(false);
      }
    });
  }

  createAndConnectRepo() {
    const projectId = this.projectService.projectId();
    const repoName = this.githubNewRepoName();

    if (!projectId || !repoName) return;

    this.githubSyncing.set(true);
    this.githubService.createRepository(repoName, true, `Created by Adorable`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (repo) => {
        this.githubService.connectProject(projectId, repo.full_name).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: () => {
            this.toastService.show(`Created and connected to ${repo.full_name}`, 'success');
            this.loadGitHubSyncStatus();
            this.githubCreateMode.set(false);
            this.githubNewRepoName.set('');
            this.githubSyncing.set(false);
          },
          error: (err) => {
            console.error('Failed to connect:', err);
            this.toastService.show('Repository created but failed to connect', 'error');
            this.githubSyncing.set(false);
          }
        });
      },
      error: (err) => {
        console.error('Failed to create repo:', err);
        this.toastService.show('Failed to create repository', 'error');
        this.githubSyncing.set(false);
      }
    });
  }

  async disconnectFromGitHub() {
    const projectId = this.projectService.projectId();
    if (!projectId) return;

    const confirmed = await this.confirmService.confirm('Disconnect this project from GitHub?', 'Disconnect', 'Cancel');
    if (!confirmed) return;

    this.githubSyncing.set(true);
    this.githubService.disconnectProject(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toastService.show('Disconnected from GitHub', 'success');
        this.githubSyncStatus.set(null);
        this.githubSyncing.set(false);
      },
      error: (err) => {
        console.error('Failed to disconnect:', err);
        this.toastService.show('Failed to disconnect', 'error');
        this.githubSyncing.set(false);
      }
    });
  }

  pushToGitHub() {
    const projectId = this.projectService.projectId();
    if (!projectId) return;

    this.githubSyncing.set(true);
    this.githubService.pushToGitHub(projectId, `Update from Adorable`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toastService.show('Pushed to GitHub', 'success');
        this.loadGitHubSyncStatus();
        this.githubSyncing.set(false);
      },
      error: (err) => {
        console.error('Push failed:', err);
        this.toastService.show('Failed to push to GitHub', 'error');
        this.githubSyncing.set(false);
      }
    });
  }

  pullFromGitHub() {
    const projectId = this.projectService.projectId();
    if (!projectId) return;

    this.githubSyncing.set(true);
    this.githubService.pullFromGitHub(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: async (res) => {
        this.toastService.show('Pulled from GitHub', 'success');
        await this.projectService.reloadPreview(res.files);
        this.loadGitHubSyncStatus();
        this.githubSyncing.set(false);
      },
      error: (err) => {
        console.error('Pull failed:', err);
        this.toastService.show('Failed to pull from GitHub', 'error');
        this.githubSyncing.set(false);
      }
    });
  }

  deployToGitHubPages() {
    const projectId = this.projectService.projectId();
    if (!projectId) return;

    this.githubPagesDeploying.set(true);
    this.githubService.deployToPages(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.githubPagesUrl.set(res.url);
        this.toastService.show('GitHub Pages deployment started! Site will be live in a few minutes.', 'success');
        this.githubPagesDeploying.set(false);
      },
      error: (err) => {
        console.error('Deploy failed:', err);
        this.toastService.show('Failed to deploy to GitHub Pages', 'error');
        this.githubPagesDeploying.set(false);
      }
    });
  }

  loadGitHubPagesStatus() {
    const projectId = this.projectService.projectId();
    if (!projectId || !this.projectService.isSaved()) return;

    this.githubService.getPagesStatus(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (status) => {
        if (status.enabled && status.url) {
          this.githubPagesUrl.set(status.url);
        }
      },
      error: () => {}
    });
  }

  // VS Code Integration
  toggleVSCodePanel() {
    this.vscodePanelOpen.set(!this.vscodePanelOpen());
  }

  openInVSCodeFolder() {
    this.vscodePanelOpen.set(false);
    if (this.isNativeMode()) {
      const nativeUrl = ((window as any).electronAPI?.nativeAgentUrl || 'http://localhost:3334') + '/api/native/info';
      this.http.get<{ projectPath: string }>(nativeUrl).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (info) => {
          const uri = `vscode://file/${info.projectPath}?windowId=_blank`;
          window.open(uri, '_blank');
          this.toastService.show('Opening project folder in VS Code...', 'success');
        },
        error: () => {
          this.toastService.show('Project not running. Start the dev server first.', 'error');
        }
      });
    } else {
      this.http.get<ContainerInfo>(`${getServerUrl()}/api/container/info`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (info) => {
          const uri = `vscode://file/${info.hostProjectPath}?windowId=_blank`;
          window.open(uri, '_blank');
          this.toastService.show('Opening project folder in VS Code...', 'success');
        },
        error: () => {
          this.toastService.show('Container not running. Start the dev server first.', 'error');
        }
      });
    }
  }

  openInVSCodeContainer() {
    this.vscodePanelOpen.set(false);
    this.http.get<ContainerInfo>(`${getServerUrl()}/api/container/info`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (info) => {
        // Hex-encode the container ID for the Dev Containers URI
        const hexId = Array.from(new TextEncoder().encode(info.containerId))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        const uri = `vscode://vscode-remote/attached-container+${hexId}/app?windowId=_blank`;
        window.open(uri, '_blank');
        this.toastService.show('Opening container in VS Code...', 'success');
      },
      error: () => {
        this.toastService.show('Container not running. Start the dev server first.', 'error');
      }
    });
  }

  // Theme Switcher
  toggleThemePanel() {
    this.themePanelOpen.set(!this.themePanelOpen());
  }

  setThemeType(type: ThemeType) {
    this.themeService.setThemeType(type);
  }

  setThemeMode(mode: ThemeMode) {
    this.themeService.setThemeMode(mode);
  }

  getThemeIcon(): string {
    const mode = this.themeService.resolvedMode();
    const type = this.themeService.themeType();

    if (type === 'pro') {
      return mode === 'dark' ? svgIcon('palette', 16) : svgIcon('zap', 16);
    }
    return mode === 'dark' ? svgIcon('moon', 16) : svgIcon('sun', 16);
  }

  // Publish Panel
  togglePublishPanel() {
    this.publishPanelOpen.set(!this.publishPanelOpen());
    if (this.publishPanelOpen()) {
      this.loadPublishStatus();
    }
  }

  currentPublishStatus = signal<{
    isPublished: boolean;
    publishSlug: string | null;
    publishVisibility: string;
    publishedAt: string | null;
  } | null>(null);

  currentPublishUrl = computed(() => {
    const status = this.currentPublishStatus();
    if (!status?.isPublished || !status.publishSlug) return '';
    return `${window.location.origin}/sites/${status.publishSlug}/index.html`;
  });

  loadPublishStatus() {
    const projectId = this.projectService.projectId();
    if (!projectId || !this.projectService.isSaved()) return;

    this.apiService.loadProject(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (project) => {
        this.currentPublishStatus.set({
          isPublished: project.isPublished,
          publishSlug: project.publishSlug,
          publishVisibility: project.publishVisibility || 'public',
          publishedAt: project.publishedAt,
        });
        if (project.publishVisibility) {
          this.publishVisibility.set(project.publishVisibility);
        }
      },
      error: () => {},
    });
  }

  async doPublish() {
    const useCloud = this.isDesktop && this.cloudSyncService.isConnected() && this.publishTarget() === 'cloud';

    if (useCloud) {
      await this.doCloudPublish();
    } else {
      await this.projectService.publish(this.publishVisibility());
      this.publishPanelOpen.set(false);
    }
  }

  private async doCloudPublish() {
    const id = this.projectService.projectId();
    if (!id || !this.projectService.isSaved()) {
      this.toastService.show('Please save the project first', 'info');
      return;
    }

    this.projectService.loading.set(true);
    try {
      // Build locally
      const exitCode = await this.containerEngine.runBuild(['--base-href', './']);
      if (exitCode !== 0) throw new Error('Build failed');

      // Read dist files (same logic as ProjectService)
      const engine = this.containerEngine as any;
      let distPath = 'dist';
      try {
        const entries = await engine.readdir('dist', { withFileTypes: true });
        if (entries.some((e: any) => e.name === 'index.html')) {
          distPath = 'dist';
        } else {
          distPath = 'dist/app/browser';
        }
      } catch {
        distPath = 'dist/app/browser';
      }

      // Simple file read (text only for cloud publish)
      const readFiles = async (dir: string): Promise<any> => {
        const result = await engine.readdir(dir, { withFileTypes: true });
        const files: any = {};
        for (const entry of result) {
          const fullPath = `${dir}/${entry.name}`;
          if (entry.isDirectory()) {
            files[entry.name] = { directory: await readFiles(fullPath) };
          } else {
            const contents = await engine.readFile(fullPath);
            files[entry.name] = { file: { contents } };
          }
        }
        return files;
      };

      const files = await readFiles(distPath);

      const result = await this.cloudSyncService.publishSiteToCloud(id, files, this.publishVisibility());
      this.toastService.show('Published to cloud!', 'success');
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.openExternal) {
        electronAPI.openExternal(result.url);
      } else {
        window.open(result.url, '_blank');
      }
      this.publishPanelOpen.set(false);
    } catch (err: any) {
      console.error('[CloudPublish] Error:', err);
      this.toastService.show(err.message || 'Cloud publish failed', 'error');
    } finally {
      this.projectService.loading.set(false);
    }
  }

  async doUnpublish() {
    const projectId = this.projectService.projectId();
    if (!projectId) return;

    this.apiService.unpublish(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toastService.show('Site unpublished', 'success');
        this.currentPublishStatus.set(null);
        this.publishPanelOpen.set(false);
      },
      error: (err) => {
        console.error('[Unpublish] Error:', err);
        this.toastService.show('Failed to unpublish', 'error');
      },
    });
  }

  changeVisibility(visibility: PublishVisibility) {
    this.publishVisibility.set(visibility);
    const projectId = this.projectService.projectId();
    if (!projectId) return;

    // Only update on server if already published
    const status = this.currentPublishStatus();
    if (status?.isPublished) {
      this.apiService.updatePublishVisibility(projectId, visibility).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.currentPublishStatus.set({ ...status!, publishVisibility: visibility });
          this.toastService.show(`Visibility changed to ${visibility}`, 'success');
        },
        error: (err) => {
          console.error('[Visibility] Error:', err);
          this.toastService.show('Failed to update visibility', 'error');
        },
      });
    }
  }

  copyPublishUrl() {
    const url = this.currentPublishUrl();
    if (url) {
      navigator.clipboard.writeText(url);
      this.toastService.show('URL copied!', 'success');
    }
  }

  // --- Settings Dialog (full profile) ---
  settingsDialogOpen = signal(false);
  settingsLoading = signal(false);
  settingsSaving = signal(false);
  settingsFetchedModels = signal<Record<string, string[]>>({});
  settingsTab = signal<'account' | 'providers' | 'integrations' | 'mcp' | 'about'>('providers');
  settingsUser = signal<any>(null);
  settingsName = signal('');
  settingsMcpServers = signal<MCPServerConfig[]>([]);

  private defaultSettings: AppSettings = {
    profiles: [
      { id: 'anthropic', name: 'Anthropic (Claude)', provider: 'anthropic', apiKey: '', model: 'claude-sonnet-4-5-20250929' },
      { id: 'gemini', name: 'Google (Gemini)', provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash' },
      { id: 'figma', name: 'Figma', provider: 'figma', apiKey: '', model: '' },
      { id: 'claude-code', name: 'Claude Code (Local)', provider: 'claude-code', apiKey: '', model: 'sonnet' }
    ],
    activeProfileId: 'anthropic',
    themeSettings: this.themeService.getSettings()
  };

  settingsData = signal<AppSettings>(this.defaultSettings);

  openSettingsDialog() {
    this.settingsDialogOpen.set(true);
    this.loadSettings();
  }

  closeSettingsDialog() {
    this.settingsDialogOpen.set(false);
  }

  private loadSettings() {
    this.settingsLoading.set(true);
    this.apiService.getProfile().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (user) => {
        this.settingsUser.set(user);
        this.settingsName.set(user.name || '');

        if (user.settings) {
          const parsed = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
          const defaultProfiles = this.defaultSettings.profiles;
          let profiles = parsed.profiles || [];

          if (!parsed.profiles && parsed.provider) {
            let pName = parsed.provider;
            if (pName === 'google') pName = 'gemini';
            profiles = [{ id: pName, name: pName === 'anthropic' ? 'Anthropic (Claude)' : 'Google (Gemini)', provider: pName, apiKey: parsed.apiKey || '', model: parsed.model || '' }];
            parsed.activeProfileId = pName;
          }

          const mergedProfiles = defaultProfiles.map(def => {
            const loaded = profiles.find((p: any) => p.id === def.id || p.provider === def.provider);
            return loaded ? { ...def, ...loaded, id: def.id } : def;
          });

          const mcpServers = parsed.mcpServers || [];
          this.settingsMcpServers.set(mcpServers);

          this.settingsData.set({
            profiles: mergedProfiles,
            activeProfileId: parsed.activeProfileId || 'anthropic',
            theme: parsed.theme || 'dark',
            themeSettings: this.themeService.getSettings(),
            mcpServers,
            angularMcpEnabled: parsed.angularMcpEnabled !== false,
            kitLessonsEnabled: parsed.kitLessonsEnabled !== false
          });

          mergedProfiles.forEach(p => {
            if (p.apiKey && p.provider !== 'figma' && p.provider !== 'claude-code') this.fetchSettingsModels(p);
          });
        }
        this.settingsLoading.set(false);
      },
      error: () => {
        this.settingsLoading.set(false);
        this.toastService.show('Failed to load settings', 'error');
      }
    });
  }

  private fetchSettingsModels(profile: AIProfile) {
    let providerParam = profile.provider;
    if (providerParam === 'gemini') providerParam = 'google' as any;
    this.apiService.getModels(providerParam, profile.apiKey).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (models) => {
        this.settingsFetchedModels.update(current => ({ ...current, [profile.id]: models }));
      },
      error: () => {}
    });
  }

  // Account tab handlers
  onSettingsNameChange(name: string) {
    this.settingsName.set(name);
  }

  onSettingsThemeTypeChange(type: ThemeType) {
    const newSettings: ThemeSettings = { ...this.settingsData().themeSettings!, type };
    this.settingsData.update(s => ({ ...s, themeSettings: newSettings }));
    this.themeService.setThemeType(type);
  }

  onSettingsThemeModeChange(mode: ThemeMode) {
    const newSettings: ThemeSettings = { ...this.settingsData().themeSettings!, mode };
    this.settingsData.update(s => ({ ...s, themeSettings: newSettings }));
    this.themeService.setThemeMode(mode);
  }

  // Providers tab handlers
  onSettingsSetActive(id: string) {
    this.settingsData.update(s => ({ ...s, activeProfileId: id }));
  }

  onSettingsProfileUpdated(event: {id: string, updates: Partial<AIProfile>}) {
    this.settingsData.update(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === event.id ? { ...p, ...event.updates } : p)
    }));
  }

  onSettingsBuiltInToolToggled(event: {profileId: string, tool: keyof BuiltInToolConfig, enabled: boolean}) {
    const profile = this.settingsData().profiles.find(p => p.id === event.profileId);
    const current = profile?.builtInTools || {};
    this.onSettingsProfileUpdated({ id: event.profileId, updates: { builtInTools: { ...current, [event.tool]: event.enabled } } });
  }

  onSettingsSapModeToggled(event: {profileId: string, enabled: boolean}) {
    const profile = this.settingsData().profiles.find(p => p.id === event.profileId);
    const current = profile?.sapAiCore || { enabled: false, authUrl: '', clientId: '', clientSecret: '', resourceGroup: 'default' };
    this.onSettingsProfileUpdated({ id: event.profileId, updates: { sapAiCore: { ...current, enabled: event.enabled } } });
  }

  onSettingsSapConfigUpdated(event: {profileId: string, updates: Partial<SapAiCoreConfig>}) {
    const profile = this.settingsData().profiles.find(p => p.id === event.profileId);
    const current = profile?.sapAiCore || { enabled: false, authUrl: '', clientId: '', clientSecret: '', resourceGroup: 'default' };
    this.onSettingsProfileUpdated({ id: event.profileId, updates: { sapAiCore: { ...current, ...event.updates } } });
  }

  onSettingsFetchModels(profile: AIProfile) {
    this.fetchSettingsModels(profile);
  }

  // MCP tab handlers
  onSettingsMcpServersChange(servers: MCPServerConfig[]) {
    this.settingsMcpServers.set(servers);
    this.settingsData.update(s => ({ ...s, mcpServers: servers }));
  }

  onSettingsAngularMcpToggle(enabled: boolean) {
    this.settingsData.update(s => ({ ...s, angularMcpEnabled: enabled }));
  }

  onSettingsKitLessonsToggle(enabled: boolean) {
    this.settingsData.update(s => ({ ...s, kitLessonsEnabled: enabled }));
  }

  saveAndCloseSettings() {
    this.settingsSaving.set(true);
    const current = this.settingsData();
    if (!current.profiles.find(p => p.id === current.activeProfileId)) {
      current.activeProfileId = current.profiles[0]?.id;
    }
    this.apiService.updateProfile({ name: this.settingsName(), settings: current }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toastService.show('Settings saved!', 'success');
        this.settingsSaving.set(false);
        this.settingsDialogOpen.set(false);
        // Broadcast settings change so workspace picks it up
        window.dispatchEvent(new CustomEvent('adorable-settings-saved'));
      },
      error: () => {
        this.toastService.show('Failed to save settings', 'error');
        this.settingsSaving.set(false);
      }
    });
  }
}