import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SessionLogEntry, SessionSuggestion, AnalysisStreamEvent } from '@adorable/shared-types';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private apiUrl = ((window as any).electronAPI?.serverUrl || 'http://localhost:3333') + '/api';

  generateStream(prompt: string, previousFiles?: any, options?: { provider?: string, apiKey?: string, model?: string, images?: string[], openFiles?: { [path: string]: string }, forcedSkill?: string, planMode?: boolean, kitId?: string, projectId?: string, builtInTools?: { webSearch?: boolean, urlContext?: boolean }, reasoningEffort?: string, history?: { role: string; text: string }[], contextSummary?: string }): Observable<any> {
    return new Observable(observer => {
      const token = localStorage.getItem('adorable_token');
      
      fetch(`${this.apiUrl}/generate-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt, previousFiles, ...options })
      }).then(response => {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (!reader) {
          observer.error('No reader');
          return;
        }

        const push = () => {
          reader.read().then(({ done, value }) => {
            if (done) {
              observer.complete();
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Keep the last element — it may be an incomplete line
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  observer.next(data);
                } catch (e) {
                  // Malformed JSON in a complete line, skip
                }
              }
            }
            push();
          });
        };
        push();
      }).catch(err => observer.error(err));
    });
  }

  saveProject(name: string, files?: any, messages?: any[], id?: string, thumbnail?: string, figmaImports?: any[], selectedKitId?: string | null, cloudProjectId?: string, cloudCommitSha?: string, cloudLastSyncAt?: string) {
    return this.http.post<any>(`${this.apiUrl}/projects`, { name, files, messages, id, thumbnail, figmaImports, selectedKitId, cloudProjectId, cloudCommitSha, cloudLastSyncAt });
  }

  listProjects() {
    return this.http.get<any[]>(`${this.apiUrl}/projects`);
  }

  loadProject(id: string) {
    return this.http.get<any>(`${this.apiUrl}/projects/${id}`);
  }

  deleteProject(id: string) {
    return this.http.delete<any>(`${this.apiUrl}/projects/${id}`);
  }

  cloneProject(id: string, name?: string, includeMessages?: boolean) {
    return this.http.post<any>(`${this.apiUrl}/projects/${id}/clone`, { name, includeMessages });
  }

  getProjectHistory(projectId: string): Observable<{ commits: { sha: string; message: string; date: string }[] }> {
    return this.http.get<{ commits: { sha: string; message: string; date: string }[] }>(`${this.apiUrl}/projects/${projectId}/history`);
  }

  restoreVersion(projectId: string, commitSha: string) {
    return this.http.post<any>(`${this.apiUrl}/projects/${projectId}/restore`, { commitSha });
  }

  getProfile() {
    return this.http.get<any>(`${this.apiUrl}/profile`);
  }

  updateProfile(data: { name?: string, settings?: any }) {
    return this.http.post<any>(`${this.apiUrl}/profile`, data);
  }

  getSettings(): Observable<any> {
    return new Observable(observer => {
      this.getProfile().subscribe({
        next: (profile) => {
          observer.next(profile?.settings || {});
          observer.complete();
        },
        error: (err) => observer.error(err)
      });
    });
  }

  getModels(provider: string, apiKey: string) {
    return this.http.get<string[]>(`${this.apiUrl}/models/${provider}`, {
      headers: { 'x-api-key': apiKey }
    });
  }

  publish(projectId: string, files: any) {
    return this.http.post<any>(`${this.apiUrl}/projects/publish/${projectId}`, { files });
  }

  // MCP Server methods
  testMcpConnection(config: {
    transport?: 'http' | 'stdio';
    url?: string;
    authType?: string;
    apiKey?: string;
    name?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  }): Observable<{ success: boolean; error?: string; toolCount?: number }> {
    return this.http.post<{ success: boolean; error?: string; toolCount?: number }>(`${this.apiUrl}/mcp/test`, config);
  }

  getMcpTools(config: { url: string; authType: string; apiKey?: string; name?: string }): Observable<{ tools: { name: string; originalName: string; description: string }[] }> {
    return this.http.post<{ tools: { name: string; originalName: string; description: string }[] }>(`${this.apiUrl}/mcp/tools`, config);
  }

  getAvailableMcpTools(): Observable<{
    servers: { id: string; name: string; url: string; enabled: boolean }[];
    tools: { name: string; originalName: string; description: string; serverId: string }[]
  }> {
    return this.http.get<any>(`${this.apiUrl}/mcp/available-tools`);
  }

  // Question answer methods for ask_user tool
  submitQuestionAnswers(requestId: string, answers: Record<string, any>) {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/question/${requestId}`, { answers });
  }

  cancelQuestion(requestId: string) {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/question/${requestId}`, { cancelled: true });
  }

  // Analytics
  getPricing(): Observable<{ defaults: Record<string, any>, custom: Record<string, any> }> {
    return this.http.get<{ defaults: Record<string, any>, custom: Record<string, any> }>(`${this.apiUrl}/analytics/pricing`);
  }

  getUsageAnalytics(range: string, projectId?: string): Observable<any> {
    let url = `${this.apiUrl}/analytics/usage?range=${range}`;
    if (projectId) url += `&projectId=${projectId}`;
    return this.http.get<any>(url);
  }

  // Kit Builder methods
  getDefaultSystemPrompt(): Observable<{ prompt: string }> {
    return this.http.get<{ prompt: string }>(`${this.apiUrl}/kits/default-system-prompt`);
  }

  discoverStorybookComponents(url: string): Observable<{ success: boolean; components: any[]; count: number }> {
    return this.http.post<{ success: boolean; components: any[]; count: number }>(`${this.apiUrl}/kits/discover`, { url });
  }

  // Discover components directly from npm package (no Storybook needed)
  discoverNpmComponents(packageName: string): Observable<{
    success: boolean;
    packageName: string;
    version: string;
    components: any[];
    count: number;
    errors?: string[];
  }> {
    return this.http.post<any>(`${this.apiUrl}/kits/discover-npm`, { packageName });
  }

  getComponentDocumentation(url: string, component: any): Observable<{ success: boolean; documentation: any }> {
    return this.http.post<{ success: boolean; documentation: any }>(`${this.apiUrl}/kits/component-docs`, { url, component });
  }

  listKits(): Observable<{ kits: any[] }> {
    return this.http.get<{ kits: any[] }>(`${this.apiUrl}/kits`);
  }

  getKits(): Observable<any[]> {
    return new Observable(observer => {
      this.listKits().subscribe({
        next: (result) => {
          observer.next(result.kits || []);
          observer.complete();
        },
        error: (err) => observer.error(err)
      });
    });
  }

  getKit(id: string): Observable<{ kit: any }> {
    return this.http.get<{ kit: any }>(`${this.apiUrl}/kits/${id}`);
  }

  createKit(data: {
    name: string;
    npmPackage?: string;
    storybookUrl?: string;
    components?: any[];
    selectedComponentIds?: string[];
    mcpServerIds?: string[];
  }): Observable<{ success: boolean; kit: any }> {
    return this.http.post<{ success: boolean; kit: any }>(`${this.apiUrl}/kits`, data);
  }

  updateKit(id: string, data: any): Observable<{ success: boolean; kit: any }> {
    return this.http.put<{ success: boolean; kit: any }>(`${this.apiUrl}/kits/${id}`, data);
  }

  deleteKit(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/kits/${id}`);
  }

  updateKitComponents(id: string, selectedComponentIds: string[]): Observable<{ success: boolean; kit: any }> {
    return this.http.put<{ success: boolean; kit: any }>(`${this.apiUrl}/kits/${id}/components`, { selectedComponentIds });
  }

  rediscoverKitComponents(id: string): Observable<{ success: boolean; kit: any; newCount: number; preservedSelections: number }> {
    return this.http.post<{ success: boolean; kit: any; newCount: number; preservedSelections: number }>(`${this.apiUrl}/kits/${id}/rediscover`, {});
  }

  // Kit tool preview/testing
  getKitTools(kitId: string): Observable<{ success: boolean; kitName: string; tools: any[] }> {
    return this.http.get<{ success: boolean; kitName: string; tools: any[] }>(`${this.apiUrl}/kits/${kitId}/tools`);
  }

  previewKitTool(kitId: string, tool: string, args?: any): Observable<{ success: boolean; tool: string; output: string; isError: boolean }> {
    return this.http.post<{ success: boolean; tool: string; output: string; isError: boolean }>(`${this.apiUrl}/kits/${kitId}/preview-tool`, { tool, args });
  }

  // NPM package analysis
  analyzeNpmPackage(packageName: string): Observable<{ success: boolean; packageName: string; version: string; exports: any[]; errors: string[] }> {
    return this.http.post<any>(`${this.apiUrl}/kits/analyze-npm`, { packageName });
  }

  validateKitComponents(packageName: string, components: any[], importSuffix?: string): Observable<{
    success: boolean;
    packageName: string;
    version: string;
    totalExports: number;
    validation: {
      validCount: number;
      invalidCount: number;
      valid: { name: string; id: string; exportName: string }[];
      invalid: { name: string; id: string; reason: string }[];
      unmatchedExports: any[];
    };
  }> {
    return this.http.post<any>(`${this.apiUrl}/kits/validate-components`, { packageName, components, importSuffix });
  }

  // Fetch component metadata from npm package
  fetchComponentMetadata(packageName: string, componentName: string): Observable<{
    success: boolean;
    metadata?: {
      name: string;
      selector?: string;
      usageType?: 'directive' | 'component';
      description?: string;
      inputs?: { name: string; type: string; description?: string; required?: boolean; defaultValue?: string }[];
      examples?: { title?: string; code: string; language?: string }[];
    };
    error?: string;
  }> {
    return this.http.post<any>(`${this.apiUrl}/kits/component-metadata`, { packageName, componentName });
  }

  // Kit file management
  getKitFiles(kitId: string): Observable<{ success: boolean; files: { path: string; size: number; modified: string }[] }> {
    return this.http.get<any>(`${this.apiUrl}/kits/${kitId}/files`);
  }

  getKitFile(kitId: string, filePath: string): Observable<{ success: boolean; path: string; content: string }> {
    return this.http.get<any>(`${this.apiUrl}/kits/${kitId}/files/${filePath}`);
  }

  updateKitFile(kitId: string, filePath: string, content: string): Observable<{ success: boolean; path: string }> {
    return this.http.put<any>(`${this.apiUrl}/kits/${kitId}/files/${filePath}`, { content });
  }

  deleteKitFile(kitId: string, filePath: string): Observable<{ success: boolean; path: string }> {
    return this.http.delete<any>(`${this.apiUrl}/kits/${kitId}/files/${filePath}`);
  }

  uploadKitFiles(kitId: string, files: { path: string; content: string }[]): Observable<{ success: boolean; count: number }> {
    return this.http.post<any>(`${this.apiUrl}/kits/${kitId}/upload-files`, { files });
  }

  regenerateKitDocs(kitId: string, overwrite?: boolean): Observable<{ success: boolean; fileCount: number; files: string[] }> {
    return this.http.post<any>(`${this.apiUrl}/kits/${kitId}/regenerate-docs`, { overwrite });
  }

  // Conversation history summarization
  summarizeContext(messages: { role: string; text: string }[]): Observable<{ summary: string }> {
    return this.http.post<{ summary: string }>(`${this.apiUrl}/summarize-context`, { messages });
  }

  // Fetch metadata for multiple components
  fetchBatchComponentMetadata(packageName: string, componentNames: string[]): Observable<{
    success: boolean;
    metadata: Record<string, {
      name: string;
      selector?: string;
      usageType?: 'directive' | 'component';
      description?: string;
      inputs?: { name: string; type: string; description?: string; required?: boolean; defaultValue?: string }[];
      examples?: { title?: string; code: string; language?: string }[];
    }>;
    found: number;
    total: number;
  }> {
    return this.http.post<any>(`${this.apiUrl}/kits/batch-metadata`, { packageName, componentNames });
  }

  // Session Analyzer methods
  listSessions(projectId: string): Observable<{ sessions: SessionLogEntry[] }> {
    return this.http.get<{ sessions: SessionLogEntry[] }>(`${this.apiUrl}/sessions?projectId=${projectId}`);
  }

  analyzeSession(filename: string, projectId?: string, kitId?: string): Observable<AnalysisStreamEvent> {
    return new Observable(observer => {
      const token = localStorage.getItem('adorable_token');

      fetch(`${this.apiUrl}/sessions/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ filename, projectId, kitId })
      }).then(response => {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (!reader) {
          observer.error('No reader');
          return;
        }

        const push = () => {
          reader.read().then(({ done, value }) => {
            if (done) {
              observer.complete();
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  observer.next(data);
                } catch {
                  // Skip malformed JSON
                }
              }
            }
            push();
          });
        };
        push();
      }).catch(err => observer.error(err));
    });
  }

  applySuggestion(suggestion: SessionSuggestion): Observable<{ success: boolean; error?: string }> {
    return this.http.post<{ success: boolean; error?: string }>(`${this.apiUrl}/sessions/apply`, { suggestion });
  }
}
