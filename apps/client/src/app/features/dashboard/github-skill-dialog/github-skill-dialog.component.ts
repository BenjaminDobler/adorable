import { Component, output, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { SkillsService } from '../../../core/services/skills';
import { ToastService } from '../../../core/services/toast';

interface RemoteSkill {
  name: string;
  description: string;
  path: string;
  selected: boolean;
}

@Component({
  selector: 'app-github-skill-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './github-skill-dialog.component.html',
  styleUrl: './github-skill-dialog.component.scss'
})
export class GitHubSkillDialogComponent {
  close = output<void>();
  installed = output<string[]>();

  private destroyRef = inject(DestroyRef);
  private skillsService = inject(SkillsService);
  private toastService = inject(ToastService);

  repoUrl = '';
  loading = signal(false);
  installing = signal(false);
  error = signal('');
  availableSkills = signal<RemoteSkill[]>([]);

  selectRepo(repo: string) {
    this.repoUrl = repo;
    this.listSkills();
  }

  listSkills() {
    if (!this.repoUrl) return;

    this.loading.set(true);
    this.error.set('');
    this.availableSkills.set([]);

    this.skillsService.listFromGitHub(this.repoUrl).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.loading.set(false);
        if (result.skills.length === 0) {
          this.error.set('No skills found in this repository');
        } else {
          this.availableSkills.set(
            result.skills.map(s => ({ ...s, path: '', selected: true }))
          );
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.error || 'Failed to list skills');
      }
    });
  }

  toggleSkill(skill: RemoteSkill) {
    skill.selected = !skill.selected;
    this.availableSkills.update(skills => [...skills]);
  }

  hasSelectedSkills(): boolean {
    return this.availableSkills().some(s => s.selected);
  }

  installSkills() {
    const selected = this.availableSkills().filter(s => s.selected);
    if (selected.length === 0) return;

    this.installing.set(true);
    this.error.set('');

    // Install each selected skill
    const skillNames = selected.map(s => s.name);

    // For simplicity, install all at once (the API handles it)
    this.skillsService.installFromGitHub(this.repoUrl).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.installing.set(false);
        this.toastService.show(`Installed ${result.installed.length} skill(s)`, 'success');
        this.installed.emit(result.installed);
        this.close.emit();
      },
      error: (err) => {
        this.installing.set(false);
        this.error.set(err.error?.error || 'Failed to install skills');
      }
    });
  }
}
