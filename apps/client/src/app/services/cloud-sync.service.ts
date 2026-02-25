import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api';
import { SyncStatusProject } from '@adorable/shared-types';

export type CloudSyncStatus = 'synced' | 'local-ahead' | 'cloud-ahead' | 'both-changed' | 'unlinked';

interface KitIdMap {
  [localId: string]: string; // localId -> cloudId
}

export interface CloudKit {
  id: string;
  name: string;
  description?: string;
}

export interface CloudSkill {
  name: string;
  description?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CloudSyncService {
  private apiService = inject(ApiService);

  cloudUrl = signal<string>(localStorage.getItem('adorable_cloud_url') || '');
  cloudToken = signal<string>(localStorage.getItem('adorable_cloud_token') || '');
  cloudUser = signal<{ email: string; name?: string } | null>(null);

  isConnected = computed(() => !!this.cloudUrl() && !!this.cloudToken());

  loading = signal(false);
  error = signal<string | null>(null);

  constructor() {
    // If we have stored credentials, validate them
    if (this.isConnected()) {
      this.validateConnection();
    }
  }

  async login(url: string, email: string, password: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    // Normalize URL: remove trailing slash
    const normalizedUrl = url.replace(/\/+$/, '');

    try {
      const response = await fetch(`${normalizedUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Login failed (${response.status})`);
      }

      const data = await response.json();
      if (!data.token) {
        throw new Error('No token received');
      }

      // Store credentials
      this.cloudUrl.set(normalizedUrl);
      this.cloudToken.set(data.token);
      localStorage.setItem('adorable_cloud_url', normalizedUrl);
      localStorage.setItem('adorable_cloud_token', data.token);

      // Fetch user info
      this.cloudUser.set({ email, name: data.user?.name });
    } catch (e: any) {
      this.error.set(e.message || 'Login failed');
      throw e;
    } finally {
      this.loading.set(false);
    }
  }

  disconnect(): void {
    this.cloudUrl.set('');
    this.cloudToken.set('');
    this.cloudUser.set(null);
    localStorage.removeItem('adorable_cloud_url');
    localStorage.removeItem('adorable_cloud_token');
  }

  async getCloudProjects(): Promise<SyncStatusProject[]> {
    const response = await this.cloudFetch('/api/projects/sync-status');
    if (!response.ok) {
      throw new Error('Failed to fetch cloud projects');
    }
    return response.json();
  }

  async importProject(cloudProjectId: string): Promise<any> {
    // 1. Fetch full project data from cloud
    const importResponse = await this.cloudFetch('/api/projects/import', {
      method: 'POST',
      body: JSON.stringify({ projectId: cloudProjectId }),
    });

    if (!importResponse.ok) {
      const err = await importResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to import from cloud');
    }

    const importData = await importResponse.json();

    // 2. If project has a kit, try to auto-download it
    let localKitId = importData.project.selectedKitId;
    if (localKitId) {
      const existingLocalId = this.getLocalKitId(localKitId);
      if (existingLocalId) {
        // Kit already mapped locally
        localKitId = existingLocalId;
      } else {
        // Try to import the kit from cloud
        try {
          const importedLocalId = await this.importKit(localKitId);
          localKitId = importedLocalId;
        } catch (e) {
          console.warn('[CloudSync] Failed to auto-download kit, using cloud ID as-is:', e);
        }
      }
    }

    // 3. Create project locally via ApiService (uses HttpClient with auth interceptor)
    console.log('[CloudSync] Creating local project, token present:', !!localStorage.getItem('adorable_token'));
    const localProject = await firstValueFrom(
      this.apiService.saveProject(
        importData.project.name,
        importData.files,
        importData.messages,
        undefined, // new project
        importData.project.thumbnail,
        undefined, // figmaImports
        localKitId,
      )
    );

    // 4. Update the local project with cloud sync metadata
    await firstValueFrom(
      this.apiService.saveProject(
        localProject.name,
        undefined, // don't re-send files
        undefined, // don't re-send messages
        localProject.id,
        undefined,
        undefined,
        undefined,
        cloudProjectId,
        importData.headSha || undefined,
        new Date().toISOString(),
      )
    );

    return localProject;
  }

  async pushProject(localProject: any): Promise<string | null> {
    if (!localProject.cloudProjectId) {
      throw new Error('Project is not linked to a cloud project');
    }

    // 1. Load full local project data via ApiService
    const localData = await firstValueFrom(this.apiService.loadProject(localProject.id));

    // 2. Translate local kit ID to cloud kit ID
    let cloudKitId = localData.selectedKitId;
    if (cloudKitId) {
      const mappedCloudId = this.getCloudKitId(cloudKitId);
      if (mappedCloudId) {
        cloudKitId = mappedCloudId;
      } else {
        // Auto-publish kit to cloud
        try {
          const newCloudId = await this.publishKit(cloudKitId);
          cloudKitId = newCloudId;
        } catch (e) {
          console.warn('[CloudSync] Failed to auto-publish kit, sending local ID:', e);
        }
      }
    }

    // 3. Push to cloud
    const pushResponse = await this.cloudFetch(`/api/projects/${localProject.cloudProjectId}/push`, {
      method: 'POST',
      body: JSON.stringify({
        files: localData.files,
        messages: localData.messages,
        name: localData.name,
        thumbnail: localData.thumbnail,
        selectedKitId: cloudKitId,
      }),
    });

    if (!pushResponse.ok) {
      const err = await pushResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to push to cloud');
    }

    const pushData = await pushResponse.json();

    // 4. Update local sync metadata via ApiService
    await firstValueFrom(
      this.apiService.saveProject(
        localData.name,
        undefined,
        undefined,
        localProject.id,
        undefined,
        undefined,
        undefined,
        undefined, // don't change cloudProjectId
        pushData.headSha,
        new Date().toISOString(),
      )
    );

    return pushData.headSha;
  }

  async pullProject(localProject: any): Promise<void> {
    if (!localProject.cloudProjectId) {
      throw new Error('Project is not linked to a cloud project');
    }

    // 1. Pull from cloud
    const pullResponse = await this.cloudFetch(`/api/projects/${localProject.cloudProjectId}/pull`, {
      method: 'POST',
    });

    if (!pullResponse.ok) {
      const err = await pullResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to pull from cloud');
    }

    const pullData = await pullResponse.json();

    // 2. Save to local project via ApiService
    await firstValueFrom(
      this.apiService.saveProject(
        pullData.name,
        pullData.files,
        pullData.messages,
        localProject.id,
        pullData.thumbnail,
        undefined,
        undefined,
        undefined, // don't change cloudProjectId
        pullData.headSha,
        new Date().toISOString(),
      )
    );
  }

  /**
   * Publish a local-only project to the cloud server.
   * Creates a new project on the cloud and links it to the local project.
   */
  async publishProject(localProjectId: string): Promise<void> {
    // 1. Load full local project data
    const localData: any = await firstValueFrom(this.apiService.loadProject(localProjectId));

    // 2. Translate local kit ID to cloud kit ID
    let cloudKitId = localData.selectedKitId;
    if (cloudKitId) {
      const mappedCloudId = this.getCloudKitId(cloudKitId);
      if (mappedCloudId) {
        cloudKitId = mappedCloudId;
      } else {
        try {
          const newCloudId = await this.publishKit(cloudKitId);
          cloudKitId = newCloudId;
        } catch (e) {
          console.warn('[CloudSync] Failed to auto-publish kit during project publish:', e);
        }
      }
    }

    // 3. Create project on cloud server
    const createResponse = await this.cloudFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: localData.name,
        files: localData.files,
        messages: localData.messages,
        thumbnail: localData.thumbnail,
        selectedKitId: cloudKitId,
      }),
    });

    if (!createResponse.ok) {
      const err = await createResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to publish to cloud');
    }

    const cloudProject = await createResponse.json();

    // 4. Get HEAD SHA from cloud
    const syncResponse = await this.cloudFetch('/api/projects/sync-status');
    const syncProjects: SyncStatusProject[] = await syncResponse.json();
    const synced = syncProjects.find(p => p.id === cloudProject.id);
    const headSha = synced?.headSha || null;

    // 5. Link local project to cloud
    await firstValueFrom(
      this.apiService.saveProject(
        localData.name,
        undefined,
        undefined,
        localProjectId,
        undefined,
        undefined,
        undefined,
        cloudProject.id,
        headSha || undefined,
        new Date().toISOString(),
      )
    );
  }

  getSyncStatus(localProject: any, cloudProject: SyncStatusProject): CloudSyncStatus {
    if (!localProject.cloudProjectId) {
      return 'unlinked';
    }

    const localSha = localProject.cloudCommitSha;
    const cloudSha = cloudProject.headSha;

    if (!localSha || !cloudSha) {
      return 'unlinked';
    }

    if (localSha === cloudSha) {
      return 'synced';
    }

    // We can't easily tell the direction without more info.
    // Use a heuristic: compare local cloudLastSyncAt with cloud updatedAt.
    // If cloud was updated after our last sync, cloud is ahead.
    // We also check if local might have changes by comparing the local project updatedAt.
    const lastSync = localProject.cloudLastSyncAt ? new Date(localProject.cloudLastSyncAt).getTime() : 0;
    const cloudUpdated = new Date(cloudProject.updatedAt).getTime();
    const localUpdated = localProject.updatedAt ? new Date(localProject.updatedAt).getTime() : 0;

    const cloudChanged = cloudUpdated > lastSync;
    const localChanged = localUpdated > lastSync;

    if (cloudChanged && localChanged) {
      return 'both-changed';
    }
    if (cloudChanged) {
      return 'cloud-ahead';
    }
    return 'local-ahead';
  }

  // ── Kit ID Mapping ──────────────────────────────────────────────────

  private getKitIdMap(): KitIdMap {
    try {
      return JSON.parse(localStorage.getItem('adorable_kit_id_map') || '{}');
    } catch {
      return {};
    }
  }

  private saveKitIdMap(map: KitIdMap): void {
    localStorage.setItem('adorable_kit_id_map', JSON.stringify(map));
  }

  getCloudKitId(localId: string): string | null {
    const map = this.getKitIdMap();
    return map[localId] || null;
  }

  getLocalKitId(cloudId: string): string | null {
    const map = this.getKitIdMap();
    for (const [localId, cId] of Object.entries(map)) {
      if (cId === cloudId) return localId;
    }
    return null;
  }

  linkKitIds(localId: string, cloudId: string): void {
    const map = this.getKitIdMap();
    map[localId] = cloudId;
    this.saveKitIdMap(map);
  }

  // ── Kit Cloud Sync ──────────────────────────────────────────────────

  /**
   * Publish a local kit to the cloud server.
   * Returns the cloud kit ID.
   */
  async publishKit(localKitId: string): Promise<string> {
    // Check if already mapped
    const existingCloudId = this.getCloudKitId(localKitId);
    if (existingCloudId) return existingCloudId;

    // 1. Export kit from local server
    const exportResponse = await this.localFetch(`/api/kits/${localKitId}/export`, { method: 'POST' });
    if (!exportResponse.ok) {
      throw new Error('Failed to export kit from local server');
    }
    const exportData = await exportResponse.json();

    // 2. Import kit to cloud server
    const importResponse = await this.cloudFetch('/api/kits/import', {
      method: 'POST',
      body: JSON.stringify(exportData),
    });
    if (!importResponse.ok) {
      const err = await importResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to import kit to cloud');
    }
    const { kit } = await importResponse.json();

    // 3. Store mapping
    this.linkKitIds(localKitId, kit.id);
    return kit.id;
  }

  /**
   * Import a kit from the cloud server to the local server.
   * Returns the local kit ID.
   */
  async importKit(cloudKitId: string): Promise<string> {
    // Check if already mapped
    const existingLocalId = this.getLocalKitId(cloudKitId);
    if (existingLocalId) return existingLocalId;

    // 1. Export kit from cloud server
    const exportResponse = await this.cloudFetch(`/api/kits/${cloudKitId}/export`, { method: 'POST' });
    if (!exportResponse.ok) {
      throw new Error('Failed to export kit from cloud server');
    }
    const exportData = await exportResponse.json();

    // 2. Import kit to local server
    const importResponse = await this.localFetch('/api/kits/import', {
      method: 'POST',
      body: JSON.stringify(exportData),
    });
    if (!importResponse.ok) {
      const err = await importResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to import kit locally');
    }
    const { kit } = await importResponse.json();

    // 3. Store mapping
    this.linkKitIds(kit.id, cloudKitId);
    return kit.id;
  }

  // ── Skill Cloud Sync ────────────────────────────────────────────────

  async publishSkill(name: string): Promise<void> {
    // 1. Export skill from local server
    const exportResponse = await this.localFetch(`/api/skills/${encodeURIComponent(name)}/export`);
    if (!exportResponse.ok) {
      throw new Error('Failed to export skill from local server');
    }
    const exportData = await exportResponse.json();

    // 2. Import skill to cloud server
    const importResponse = await this.cloudFetch('/api/skills/import', {
      method: 'POST',
      body: JSON.stringify(exportData),
    });
    if (!importResponse.ok) {
      const err = await importResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to import skill to cloud');
    }
  }

  async importSkill(name: string): Promise<void> {
    // 1. Export skill from cloud server
    const exportResponse = await this.cloudFetch(`/api/skills/${encodeURIComponent(name)}/export`);
    if (!exportResponse.ok) {
      throw new Error('Failed to export skill from cloud server');
    }
    const exportData = await exportResponse.json();

    // 2. Import skill to local server
    const importResponse = await this.localFetch('/api/skills/import', {
      method: 'POST',
      body: JSON.stringify(exportData),
    });
    if (!importResponse.ok) {
      const err = await importResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to import skill locally');
    }
  }

  // ── Cloud Kit/Skill listing ─────────────────────────────────────────

  async getCloudKits(): Promise<CloudKit[]> {
    const response = await this.cloudFetch('/api/kits');
    if (!response.ok) return [];
    const data = await response.json();
    return (data.kits || []).map((k: any) => ({ id: k.id, name: k.name, description: k.description }));
  }

  async getCloudSkills(): Promise<CloudSkill[]> {
    const response = await this.cloudFetch('/api/skills');
    if (!response.ok) return [];
    const skills: any[] = await response.json();
    // Only return user skills (not system ones)
    return skills
      .filter((s: any) => !s.sourcePath?.includes('assets/skills'))
      .map((s: any) => ({ name: s.name, description: s.description }));
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async validateConnection(): Promise<void> {
    try {
      const response = await this.cloudFetch('/api/profile');
      if (response.ok) {
        const data = await response.json();
        this.cloudUser.set({ email: data.email, name: data.name });
      } else {
        // Token expired or invalid
        this.disconnect();
      }
    } catch {
      // Network error — keep credentials, user might be offline
    }
  }

  private async cloudFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = this.cloudUrl();
    const token = this.cloudToken();

    return fetch(`${url}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });
  }

  private get localApiUrl(): string {
    // Must match ApiService's URL pattern: electronAPI.serverUrl or http://localhost:3333, plus /api
    return ((window as any).electronAPI?.serverUrl || 'http://localhost:3333') + '/api';
  }

  private get localToken(): string {
    return localStorage.getItem('adorable_token') || '';
  }

  private async localFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const baseUrl = this.localApiUrl;
    // If baseUrl already includes /api, strip it from path to avoid double /api
    const fullUrl = baseUrl.endsWith('/api') ? `${baseUrl}${path.replace(/^\/api/, '')}` : `${baseUrl}${path}`;

    return fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.localToken}`,
        ...options.headers,
      },
    });
  }

}
