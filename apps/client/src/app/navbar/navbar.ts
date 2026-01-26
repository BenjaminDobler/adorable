import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth';
import { ProjectService } from '../services/project';
import { ContainerEngine } from '../services/container-engine';
import { FormsModule } from '@angular/forms';
import { SmartContainerEngine } from '../services/smart-container.engine';
import { GitHubService } from '../services/github.service';
import { ToastService } from '../services/toast';
import { GitHubRepository, GitHubProjectSync } from '@adorable/shared-types';

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
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class NavbarComponent {
  public authService = inject(AuthService);
  public projectService = inject(ProjectService);
  public webContainerService = inject(ContainerEngine);
  public githubService = inject(GitHubService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private http = inject(HttpClient);

  // VS Code integration
  vscodePanelOpen = signal(false);

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

  // Agent Mode - only available in Docker mode
  isDockerMode = computed(() => this.webContainerService.mode() === 'local');

  constructor() {
    // Load GitHub connection status on startup
    this.githubService.getConnection().subscribe();
  }

  isProjectView() {
    return this.router.url.startsWith('/editor/');
  }

  logout() {
    this.authService.logout();
  }

  toggleEngine(event: Event) {
    const select = event.target as HTMLSelectElement;
    if (this.webContainerService instanceof SmartContainerEngine) {
       this.webContainerService.setMode(select.value as 'browser' | 'local');
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
    const id = this.projectService.projectId();
    return !!id && id !== 'new';
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
    if (!projectId || projectId === 'new') return;

    this.githubService.getSyncStatus(projectId).subscribe({
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
    this.githubService.listRepositories().subscribe({
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
    this.githubService.connectProject(projectId, repoFullName).subscribe({
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
    this.githubService.createRepository(repoName, true, `Created by Adorable`).subscribe({
      next: (repo) => {
        this.githubService.connectProject(projectId, repo.full_name).subscribe({
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

  disconnectFromGitHub() {
    const projectId = this.projectService.projectId();
    if (!projectId) return;

    if (!confirm('Disconnect this project from GitHub?')) return;

    this.githubSyncing.set(true);
    this.githubService.disconnectProject(projectId).subscribe({
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
    this.githubService.pushToGitHub(projectId, `Update from Adorable`).subscribe({
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
    this.githubService.pullFromGitHub(projectId).subscribe({
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
    this.githubService.deployToPages(projectId).subscribe({
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
    if (!projectId || projectId === 'new') return;

    this.githubService.getPagesStatus(projectId).subscribe({
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
    this.http.get<ContainerInfo>('http://localhost:3333/api/container/info').subscribe({
      next: (info) => {
        const uri = `vscode://file/${info.hostProjectPath}`;
        window.open(uri, '_blank');
        this.toastService.show('Opening project folder in VS Code...', 'success');
      },
      error: () => {
        this.toastService.show('Container not running. Start the dev server first.', 'error');
      }
    });
  }

  openInVSCodeContainer() {
    this.vscodePanelOpen.set(false);
    this.http.get<ContainerInfo>('http://localhost:3333/api/container/info').subscribe({
      next: (info) => {
        // Hex-encode the container ID for the Dev Containers URI
        const hexId = Array.from(new TextEncoder().encode(info.containerId))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        const uri = `vscode://vscode-remote/attached-container+${hexId}/app`;
        window.open(uri, '_blank');
        this.toastService.show('Opening container in VS Code...', 'success');
      },
      error: () => {
        this.toastService.show('Container not running. Start the dev server first.', 'error');
      }
    });
  }
}