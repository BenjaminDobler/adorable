import { Component, DestroyRef, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { GitHubService } from '../../../core/services/github.service';
import { ToastService } from '../../../core/services/toast';
import { AppSettings, AIProfile } from '../profile.types';

@Component({
  selector: 'app-integrations-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './integrations-tab.component.html',
  styleUrl: './integrations-tab.component.scss',
})
export class IntegrationsTabComponent {
  githubService = inject(GitHubService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  settings = input.required<AppSettings>();

  profileUpdated = output<{id: string, updates: Partial<AIProfile>}>();

  connectGitHub() {
    this.githubService.connect();
  }

  disconnectGitHub() {
    this.githubService.disconnect().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.toastService.show('GitHub disconnected', 'success'),
      error: () => this.toastService.show('Failed to disconnect GitHub', 'error')
    });
  }

  getFigmaProfile(): AIProfile | undefined {
    return this.settings().profiles.find(p => p.provider === 'figma');
  }
}
