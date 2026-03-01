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

  connected = output<void>();
  disconnected = output<void>();

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
