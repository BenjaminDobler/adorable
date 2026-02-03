import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { ConfirmService } from '../services/confirm';
import { SkillsService, Skill } from '../services/skills';
import { SkillDialogComponent } from './skill-dialog/skill-dialog.component';
import { GitHubSkillDialogComponent } from './github-skill-dialog/github-skill-dialog.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, SkillDialogComponent, GitHubSkillDialogComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent {
  private apiService = inject(ApiService);
  private skillsService = inject(SkillsService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  confirmService = inject(ConfirmService);
  private router = inject(Router);

  projects = signal<any[]>([]);
  skills = signal<Skill[]>([]);
  loading = signal(true);

  activeTab = signal<'projects' | 'skills'>('projects');
  showSkillDialog = signal(false);
  showGitHubDialog = signal(false);
  editingSkill = signal<Skill | null>(null);

  constructor() {
    this.loadData();
  }

  loadData() {
    this.loading.set(true);
    // Parallel load
    this.apiService.listProjects().subscribe({
      next: (list) => {
        this.projects.set(list);
        this.checkLoading();
      },
      error: () => {
        this.toastService.show('Failed to load projects', 'error');
        this.checkLoading();
      }
    });

    this.skillsService.getSkills().subscribe({
        next: (list) => {
            this.skills.set(list);
        },
        error: () => {
            // Non-critical
            console.warn('Failed to load skills');
        }
    });
  }

  checkLoading() {
      // Simple toggle for now, projects are main content
      this.loading.set(false);
  }

  createProject() {
    this.router.navigate(['/editor', 'new'], { queryParams: { name: 'New Project' } });
  }

  createSkill() {
    this.editingSkill.set(null);
    this.showSkillDialog.set(true);
  }

  async onSkillUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Simple Frontmatter Parser
      const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!match) throw new Error('Invalid SKILL.md format. Missing YAML frontmatter (--- ... ---).');
      
      const yamlStr = match[1];
      const instructions = match[2].trim();
      
      const meta: any = {};
      const nameMatch = yamlStr.match(/^name:\s*(.*)$/m);
      if (nameMatch) meta.name = nameMatch[1].trim();
      
      const descMatch = yamlStr.match(/^description:\s*(.*)$/m);
      if (descMatch) meta.description = descMatch[1].trim();
      
      const triggersMatch = yamlStr.match(/^triggers:\s*\[(.*)\]/m);
      if (triggersMatch) {
         meta.triggers = triggersMatch[1].split(',').map((t: string) => t.trim().replace(/['"]/g, ''));
      }

      if (!meta.name) throw new Error('Skill name is required in frontmatter.');

      const skill = {
        name: meta.name,
        description: meta.description,
        triggers: meta.triggers,
        instructions
      };

      this.onSaveSkill(skill);
    } catch (e: any) {
      console.error(e);
      this.toastService.show(e.message || 'Failed to parse skill file', 'error');
    }
    
    // Reset input
    event.target.value = '';
  }

  onSaveSkill(skillData: any) {
    this.skillsService.saveSkill(skillData).subscribe({
      next: () => {
        this.toastService.show('Skill saved successfully!', 'success');
        this.showSkillDialog.set(false);
        this.loadData();
      },
      error: (err) => {
        console.error(err);
        this.toastService.show('Failed to save skill', 'error');
      }
    });
  }

  async deleteSkill(name: string, event: Event) {
    event.stopPropagation();
    const confirmed = await this.confirmService.confirm(`Are you sure you want to delete the skill "${name}"?`, 'Delete', 'Cancel');
    if (confirmed) {
      this.skillsService.deleteSkill(name).subscribe({
        next: () => {
          this.toastService.show('Skill deleted', 'success');
          this.loadData();
        },
        error: () => this.toastService.show('Failed to delete skill', 'error')
      });
    }
  }

  async deleteProject(id: string, event: Event) {
    event.stopPropagation();
    const confirmed = await this.confirmService.confirm('Are you sure you want to delete this project?', 'Delete', 'Cancel');
    if (confirmed) {
      this.apiService.deleteProject(id).subscribe({
        next: () => {
          this.toastService.show('Project deleted', 'success');
          this.loadData();
        },
        error: () => this.toastService.show('Failed to delete project', 'error')
      });
    }
  }

  logout() {
    this.authService.logout();
  }
}