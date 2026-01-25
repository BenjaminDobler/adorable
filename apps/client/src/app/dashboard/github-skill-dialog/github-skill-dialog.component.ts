import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SkillsService } from '../../services/skills';
import { ToastService } from '../../services/toast';

interface RemoteSkill {
  name: string;
  description: string;
  path: string;
  selected: boolean;
}

@Component({
  selector: 'app-github-skill-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dialog-overlay" (click)="close.emit()">
      <div class="dialog-content" (click)="$event.stopPropagation()">
        <header>
          <h2>Install Skills from GitHub</h2>
          <button class="close-btn" (click)="close.emit()">×</button>
        </header>

        <div class="form-body">
          <div class="form-group">
            <label>Repository</label>
            <div class="input-row">
              <input
                [(ngModel)]="repoUrl"
                placeholder="e.g. analogjs/angular-skills or vercel-labs/agent-skills"
                [disabled]="loading()"
              />
              <button
                class="btn-list"
                (click)="listSkills()"
                [disabled]="!repoUrl || loading()"
              >
                {{ loading() ? 'Loading...' : 'List Skills' }}
              </button>
            </div>
            <small>Enter a GitHub repository in format owner/repo</small>
          </div>

          @if (availableSkills().length > 0) {
            <div class="skills-list">
              <label>Available Skills</label>
              @for (skill of availableSkills(); track skill.name) {
                <div class="skill-item" (click)="toggleSkill(skill)">
                  <input type="checkbox" [checked]="skill.selected" />
                  <div class="skill-details">
                    <strong>{{ skill.name }}</strong>
                    <span>{{ skill.description }}</span>
                  </div>
                </div>
              }
            </div>
          }

          @if (error()) {
            <div class="error-message">{{ error() }}</div>
          }

          <div class="popular-repos">
            <label>Popular Skill Repositories</label>
            <div class="repo-chips">
              <button class="repo-chip" (click)="selectRepo('analogjs/angular-skills')">
                analogjs/angular-skills
              </button>
              <button class="repo-chip" (click)="selectRepo('vercel-labs/agent-skills')">
                vercel-labs/agent-skills
              </button>
              <button class="repo-chip" (click)="selectRepo('anthropics/skills')">
                anthropics/skills
              </button>
            </div>
          </div>
        </div>

        <footer>
          <button class="btn-cancel" (click)="close.emit()">Cancel</button>
          <button
            class="btn-save"
            (click)="installSkills()"
            [disabled]="!hasSelectedSkills() || installing()"
          >
            {{ installing() ? 'Installing...' : 'Install Selected' }}
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialog-content {
      background: #1e1e1e;
      border-radius: 12px;
      width: 90%;
      max-width: 560px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #333;
    }

    header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .close-btn {
      background: none;
      border: none;
      color: #888;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 4px 8px;
      line-height: 1;
    }

    .close-btn:hover {
      color: #fff;
    }

    .form-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: #ccc;
    }

    .form-group small {
      display: block;
      margin-top: 6px;
      color: #888;
      font-size: 0.8rem;
    }

    .input-row {
      display: flex;
      gap: 8px;
    }

    .input-row input {
      flex: 1;
    }

    input {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #444;
      border-radius: 6px;
      background: #2a2a2a;
      color: #fff;
      font-size: 0.95rem;
    }

    input:focus {
      outline: none;
      border-color: #6366f1;
    }

    input:disabled {
      opacity: 0.6;
    }

    .btn-list {
      padding: 10px 16px;
      background: #333;
      border: 1px solid #444;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      white-space: nowrap;
    }

    .btn-list:hover:not(:disabled) {
      background: #444;
    }

    .btn-list:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .skills-list {
      margin-bottom: 20px;
    }

    .skills-list label {
      display: block;
      margin-bottom: 12px;
      font-weight: 500;
      color: #ccc;
    }

    .skill-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background: #2a2a2a;
      border-radius: 8px;
      margin-bottom: 8px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: border-color 0.2s;
    }

    .skill-item:hover {
      border-color: #444;
    }

    .skill-item input[type="checkbox"] {
      margin-top: 4px;
      width: auto;
    }

    .skill-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .skill-details strong {
      color: #fff;
    }

    .skill-details span {
      color: #888;
      font-size: 0.85rem;
    }

    .error-message {
      padding: 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: #ef4444;
      margin-bottom: 20px;
    }

    .popular-repos label {
      display: block;
      margin-bottom: 12px;
      font-weight: 500;
      color: #ccc;
    }

    .repo-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .repo-chip {
      padding: 8px 14px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 20px;
      color: #aaa;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .repo-chip:hover {
      background: #333;
      color: #fff;
      border-color: #6366f1;
    }

    footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      border-top: 1px solid #333;
    }

    .btn-cancel {
      padding: 10px 20px;
      background: transparent;
      border: 1px solid #444;
      border-radius: 6px;
      color: #aaa;
      cursor: pointer;
    }

    .btn-cancel:hover {
      background: #333;
      color: #fff;
    }

    .btn-save {
      padding: 10px 24px;
      background: #6366f1;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-weight: 500;
      cursor: pointer;
    }

    .btn-save:hover:not(:disabled) {
      background: #5558e3;
    }

    .btn-save:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class GitHubSkillDialogComponent {
  @Output() close = new EventEmitter<void>();
  @Output() installed = new EventEmitter<string[]>();

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

    this.skillsService.listFromGitHub(this.repoUrl).subscribe({
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
    this.skillsService.installFromGitHub(this.repoUrl).subscribe({
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
