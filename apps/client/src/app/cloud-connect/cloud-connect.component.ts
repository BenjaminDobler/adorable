import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CloudSyncService } from '../services/cloud-sync.service';
import { ToastService } from '../services/toast';

@Component({
  selector: 'app-cloud-connect',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cloud-connect.component.html',
  styleUrl: './cloud-connect.component.scss',
})
export class CloudConnectComponent {
  public cloudSyncService = inject(CloudSyncService);
  private toastService = inject(ToastService);

  loginUrl = signal('https://adorable.run');
  loginEmail = signal('');
  loginPassword = signal('');
  loginLoading = signal(false);
  loginError = signal<string | null>(null);

  // OAuth signals
  githubEnabled = signal(false);
  googleEnabled = signal(false);
  oauthLoading = signal(false);
  configLoaded = signal(false);

  connected = output<void>();
  disconnected = output<void>();

  get isDesktop(): boolean {
    return !!(window as any).electronAPI?.isDesktop;
  }

  async fetchConfig() {
    const url = this.loginUrl();
    if (!url) return;

    try {
      const config = await this.cloudSyncService.fetchCloudConfig(url);
      this.githubEnabled.set(config.githubLoginEnabled);
      this.googleEnabled.set(config.googleLoginEnabled);
      this.configLoaded.set(true);
    } catch {
      this.githubEnabled.set(false);
      this.googleEnabled.set(false);
      this.configLoaded.set(false);
    }
  }

  async connectWithGitHub() {
    await this.connectWithOAuth('github');
  }

  async connectWithGoogle() {
    await this.connectWithOAuth('google');
  }

  private async connectWithOAuth(provider: 'github' | 'google') {
    this.oauthLoading.set(true);
    this.loginError.set(null);
    try {
      await this.cloudSyncService.loginWithOAuth(this.loginUrl(), provider);
      this.toastService.show('Connected to cloud server!', 'success');
      this.connected.emit();
    } catch (e: any) {
      this.loginError.set(e.message || 'OAuth login failed');
    } finally {
      this.oauthLoading.set(false);
    }
  }

  async connect() {
    this.loginLoading.set(true);
    this.loginError.set(null);

    try {
      await this.cloudSyncService.login(
        this.loginUrl(),
        this.loginEmail(),
        this.loginPassword()
      );
      this.toastService.show('Connected to cloud server!', 'success');
      this.loginPassword.set('');
      this.connected.emit();
    } catch (e: any) {
      this.loginError.set(e.message || 'Connection failed');
    } finally {
      this.loginLoading.set(false);
    }
  }

  disconnect() {
    this.cloudSyncService.disconnect();
    this.toastService.show('Disconnected from cloud', 'success');
    this.disconnected.emit();
  }
}
