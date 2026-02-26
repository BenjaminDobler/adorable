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
import { CloudSyncService, CloudSyncStatus, CloudKit, CloudSkill } from '../services/cloud-sync.service';
import { isDesktopApp } from '../services/smart-container.engine';
import { SyncStatusProject } from '@adorable/shared-types';

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
  public cloudSyncService = inject(CloudSyncService);

  projects = signal<any[]>([]);
  skills = signal<Skill[]>([]);
  kits = signal<Kit[]>([]);
  loading = signal(true);

  activeTab = signal<'projects' | 'skills' | 'kits'>('projects');

  // Desktop mode detection
  isDesktopMode = computed(() => isDesktopApp());
  isCloudConnected = computed(() => this.isDesktopMode() && this.cloudSyncService.isConnected());

  // Cloud projects state
  cloudProjects = signal<SyncStatusProject[]>([]);
  cloudLoading = signal(false);
  cloudSyncStatuses = computed(() => {
    const statuses: Record<string, CloudSyncStatus> = {};
    for (const cp of this.cloudProjects()) {
      const localProject = this.projects().find((p: any) => p.cloudProjectId === cp.id);
      if (localProject) {
        statuses[cp.id] = this.cloudSyncService.getSyncStatus(localProject, cp);
      }
    }
    return statuses;
  });
  cloudActionLoading = signal<Record<string, boolean>>({});
  showSkillDialog = signal(false);
  showGitHubDialog = signal(false);
  editingSkill = signal<Skill | null>(null);

  // Cloud kit/skill state
  cloudKits = signal<CloudKit[]>([]);
  cloudSkills = signal<CloudSkill[]>([]);
  kitSyncLoading = signal<Record<string, boolean>>({});
  skillSyncLoading = signal<Record<string, boolean>>({});

  // Kit-related state
  showKitSelection = signal(false);

  // All kits including built-in default
  allKits = computed(() => {
    return [DEFAULT_KIT, ...this.kits()];
  });

  // Merged lists: local + cloud-only items
  allProjects = computed(() => {
    const local = this.projects().map((p: any) => ({
      ...p,
      isCloudOnly: false,
      cloudId: p.cloudProjectId || null,
    }));
    if (!this.isCloudConnected()) return local;
    const linkedCloudIds = new Set(this.projects().filter((p: any) => p.cloudProjectId).map((p: any) => p.cloudProjectId));
    const cloudOnly = this.cloudProjects()
      .filter(cp => !linkedCloudIds.has(cp.id))
      .map(cp => ({
        id: cp.id,
        name: cp.name,
        thumbnail: (cp as any).thumbnail || null,
        updatedAt: cp.updatedAt,
        isCloudOnly: true,
        cloudId: cp.id,
        cloudProjectId: null,
      }));
    return [...local, ...cloudOnly];
  });

  allKitsMerged = computed(() => {
    const local = this.allKits().map((k: any) => ({ ...k, isCloudOnly: false }));
    if (!this.isCloudConnected()) return local;
    const localCloudKitIds = new Set(
      this.kits().map((k: any) => this.cloudSyncService.getCloudKitId(k.id)).filter(Boolean)
    );
    const cloudOnly = this.cloudKits()
      .filter(ck => !localCloudKitIds.has(ck.id))
      .map(ck => ({
        id: ck.id,
        name: ck.name,
        description: ck.description || '',
        isCloudOnly: true,
        isBuiltIn: false,
        resources: [],
        template: null,
        thumbnail: null,
      }));
    return [...local, ...cloudOnly];
  });

  allSkillsMerged = computed(() => {
    const local = this.skills().map((s: any) => ({ ...s, isCloudOnly: false }));
    if (!this.isCloudConnected()) return local;
    const localSkillNames = new Set(this.skills().map(s => s.name));
    const cloudOnly = this.cloudSkills()
      .filter(cs => !localSkillNames.has(cs.name))
      .map(cs => ({
        name: cs.name,
        description: cs.description || '',
        isCloudOnly: true,
        sourcePath: null,
        triggers: [],
        instructions: '',
      }));
    return [...local, ...cloudOnly];
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
    if (this.isCloudConnected()) {
      this.loadCloudProjects();
    }
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

  // Cloud sync methods
  async loadCloudProjects() {
    if (!this.cloudSyncService.isConnected()) return;

    this.cloudLoading.set(true);
    try {
      const [cloudProjects, cloudKits, cloudSkills] = await Promise.all([
        this.cloudSyncService.getCloudProjects(),
        this.cloudSyncService.getCloudKits(),
        this.cloudSyncService.getCloudSkills(),
      ]);
      this.cloudProjects.set(cloudProjects);
      this.cloudKits.set(cloudKits);
      this.cloudSkills.set(cloudSkills);
    } catch (e) {
      console.warn('Failed to load cloud data:', e);
    } finally {
      this.cloudLoading.set(false);
    }
  }

  getLocalProjectForCloud(cloudProjectId: string): any | null {
    return this.projects().find(p => p.cloudProjectId === cloudProjectId) || null;
  }

  getCloudSyncStatus(cloudProjectId: string): CloudSyncStatus | null {
    return this.cloudSyncStatuses()[cloudProjectId] || null;
  }

  getCloudSyncStatusForLocalProject(project: any): CloudSyncStatus | null {
    if (!project.cloudProjectId) return null;
    return this.getCloudSyncStatus(project.cloudProjectId);
  }

  isLocalProjectLinkedToCloud(project: any): boolean {
    return !!project.cloudProjectId;
  }

  async downloadCloudProject(cloudProjectId: string) {
    this.setCloudActionLoading(cloudProjectId, true);
    try {
      await this.cloudSyncService.importProject(cloudProjectId);
      this.toastService.show('Project downloaded from cloud!', 'success');
      this.loadData();
      // Reload cloud statuses
      setTimeout(() => this.loadCloudProjects(), 500);
    } catch (e: any) {
      this.toastService.show(e.message || 'Failed to download project', 'error');
    } finally {
      this.setCloudActionLoading(cloudProjectId, false);
    }
  }

  async pushToCloud(cloudProjectId: string) {
    const localProject = this.getLocalProjectForCloud(cloudProjectId);
    if (!localProject) return;

    this.setCloudActionLoading(cloudProjectId, true);
    try {
      await this.cloudSyncService.pushProject(localProject);
      this.toastService.show('Pushed to cloud!', 'success');
      this.loadData();
      setTimeout(() => this.loadCloudProjects(), 500);
    } catch (e: any) {
      this.toastService.show(e.message || 'Failed to push', 'error');
    } finally {
      this.setCloudActionLoading(cloudProjectId, false);
    }
  }

  async pullFromCloud(cloudProjectId: string) {
    const localProject = this.getLocalProjectForCloud(cloudProjectId);
    if (!localProject) return;

    this.setCloudActionLoading(cloudProjectId, true);
    try {
      await this.cloudSyncService.pullProject(localProject);
      this.toastService.show('Pulled from cloud!', 'success');
      this.loadData();
      setTimeout(() => this.loadCloudProjects(), 500);
    } catch (e: any) {
      this.toastService.show(e.message || 'Failed to pull', 'error');
    } finally {
      this.setCloudActionLoading(cloudProjectId, false);
    }
  }

  private setCloudActionLoading(cloudProjectId: string, loading: boolean) {
    this.cloudActionLoading.update(m => ({ ...m, [cloudProjectId]: loading }));
  }

  isCloudActionLoading(cloudProjectId: string): boolean {
    return !!this.cloudActionLoading()[cloudProjectId];
  }

  publishLoading = signal<Record<string, boolean>>({});

  isPublishLoading(projectId: string): boolean {
    return !!this.publishLoading()[projectId];
  }

  async publishToCloud(projectId: string, event: Event) {
    event.stopPropagation(); // Prevent navigation to editor
    this.publishLoading.update(m => ({ ...m, [projectId]: true }));
    try {
      await this.cloudSyncService.publishProject(projectId);
      this.toastService.show('Project published to cloud!', 'success');
      this.loadData();
      if (this.isCloudConnected()) {
        setTimeout(() => this.loadCloudProjects(), 500);
      }
    } catch (e: any) {
      this.toastService.show(e.message || 'Failed to publish to cloud', 'error');
    } finally {
      this.publishLoading.update(m => ({ ...m, [projectId]: false }));
    }
  }

  // Kit cloud sync
  async publishKitToCloud(kitId: string, event: Event) {
    event.stopPropagation();
    this.kitSyncLoading.update(m => ({ ...m, [kitId]: true }));
    try {
      await this.cloudSyncService.publishKit(kitId);
      this.toastService.show('Kit published to cloud!', 'success');
      if (this.isCloudConnected()) {
        setTimeout(() => this.loadCloudProjects(), 500);
      }
    } catch (e: any) {
      this.toastService.show(e.message || 'Failed to publish kit', 'error');
    } finally {
      this.kitSyncLoading.update(m => ({ ...m, [kitId]: false }));
    }
  }

  isKitSyncLoading(kitId: string): boolean {
    return !!this.kitSyncLoading()[kitId];
  }

  async importKitFromCloud(cloudKitId: string) {
    this.kitSyncLoading.update(m => ({ ...m, [cloudKitId]: true }));
    try {
      await this.cloudSyncService.importKit(cloudKitId);
      this.toastService.show('Kit downloaded from cloud!', 'success');
      this.loadData();
    } catch (e: any) {
      this.toastService.show(e.message || 'Failed to download kit', 'error');
    } finally {
      this.kitSyncLoading.update(m => ({ ...m, [cloudKitId]: false }));
    }
  }

  isCloudKitImported(cloudKitId: string): boolean {
    return !!this.cloudSyncService.getLocalKitId(cloudKitId);
  }

  // Skill cloud sync
  async publishSkillToCloud(skillName: string, event: Event) {
    event.stopPropagation();
    this.skillSyncLoading.update(m => ({ ...m, [skillName]: true }));
    try {
      await this.cloudSyncService.publishSkill(skillName);
      this.toastService.show('Skill published to cloud!', 'success');
      if (this.isCloudConnected()) {
        setTimeout(() => this.loadCloudProjects(), 500);
      }
    } catch (e: any) {
      this.toastService.show(e.message || 'Failed to publish skill', 'error');
    } finally {
      this.skillSyncLoading.update(m => ({ ...m, [skillName]: false }));
    }
  }

  isSkillSyncLoading(name: string): boolean {
    return !!this.skillSyncLoading()[name];
  }

  async importSkillFromCloud(skillName: string) {
    this.skillSyncLoading.update(m => ({ ...m, [skillName]: true }));
    try {
      await this.cloudSyncService.importSkill(skillName);
      this.toastService.show('Skill downloaded from cloud!', 'success');
      this.loadData();
    } catch (e: any) {
      this.toastService.show(e.message || 'Failed to download skill', 'error');
    } finally {
      this.skillSyncLoading.update(m => ({ ...m, [skillName]: false }));
    }
  }

  isCloudSkillImported(skillName: string): boolean {
    return this.skills().some(s => s.name === skillName);
  }
}