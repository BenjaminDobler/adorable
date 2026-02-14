import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { ConfirmService } from '../services/confirm';
import { SkillsService, Skill } from '../services/skills';
import { SkillDialogComponent } from './skill-dialog/skill-dialog.component';
import { GitHubSkillDialogComponent } from './github-skill-dialog/github-skill-dialog.component';
import { Kit, StorybookResource } from '../services/kit-types';
import { DEFAULT_KIT } from '../base-project';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SkillDialogComponent, GitHubSkillDialogComponent],
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
  private route = inject(ActivatedRoute);

  projects = signal<any[]>([]);
  skills = signal<Skill[]>([]);
  kits = signal<Kit[]>([]);
  loading = signal(true);

  activeTab = signal<'projects' | 'skills' | 'kits'>('projects');
  showSkillDialog = signal(false);
  showGitHubDialog = signal(false);
  editingSkill = signal<Skill | null>(null);

  // Kit-related state
  showKitSelection = signal(false);

  // All kits including built-in default
  allKits = computed(() => {
    return [DEFAULT_KIT, ...this.kits()];
  });

  // Clone dialog state
  showCloneDialog = signal(false);
  cloneTargetProject = signal<{ id: string; name: string } | null>(null);
  cloneName = signal('');
  cloneIncludeMessages = signal(false);

  constructor() {
    // Check if we're returning from kit-builder with a tab param
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'kits' || tab === 'skills' || tab === 'projects') {
      this.activeTab.set(tab);
    }
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

    // Load kits
    this.apiService.getKits().subscribe({
      next: (list) => {
        this.kits.set(list);
      },
      error: () => {
        console.warn('Failed to load kits');
      }
    });
  }

  checkLoading() {
      // Simple toggle for now, projects are main content
      this.loading.set(false);
  }

  createProject() {
    // Show kit selection modal
    this.showKitSelection.set(true);
  }

  createProjectWithKit(kitId: string) {
    this.showKitSelection.set(false);
    this.router.navigate(['/editor', 'new'], { queryParams: { name: 'New Project', kitId } });
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

  openCloneDialog(id: string, name: string, event: Event) {
    event.stopPropagation();
    this.cloneTargetProject.set({ id, name });
    this.cloneName.set(`${name} (Copy)`);
    this.cloneIncludeMessages.set(false);
    this.showCloneDialog.set(true);
  }

  cancelClone() {
    this.showCloneDialog.set(false);
    this.cloneTargetProject.set(null);
  }

  confirmClone() {
    const target = this.cloneTargetProject();
    if (!target) return;

    this.apiService.cloneProject(target.id, this.cloneName(), this.cloneIncludeMessages()).subscribe({
      next: (clonedProject) => {
        this.toastService.show(`Created "${clonedProject.name}"`, 'success');
        this.showCloneDialog.set(false);
        this.cloneTargetProject.set(null);
        this.loadData();
      },
      error: () => this.toastService.show('Failed to clone project', 'error')
    });
  }

  logout() {
    this.authService.logout();
  }

  // Kit management methods
  createKit() {
    this.router.navigate(['/kit-builder/new']);
  }

  editKit(kit: Kit) {
    this.router.navigate(['/kit-builder', kit.id]);
  }

  async deleteKit(id: string, event: Event) {
    event.stopPropagation();
    const confirmed = await this.confirmService.confirm('Are you sure you want to delete this kit?', 'Delete', 'Cancel');
    if (confirmed) {
      this.apiService.deleteKit(id).subscribe({
        next: () => {
          this.toastService.show('Kit deleted', 'success');
          this.loadData();
        },
        error: () => this.toastService.show('Failed to delete kit', 'error')
      });
    }
  }

  getKitComponentCount(kit: Kit): number {
    const storybookResource = kit.resources?.find(r => r.type === 'storybook') as StorybookResource | undefined;
    if (storybookResource?.selectedComponentIds?.length) {
      return storybookResource.selectedComponentIds.length;
    }
    return 0;
  }

  cancelKitSelection() {
    this.showKitSelection.set(false);
  }
}