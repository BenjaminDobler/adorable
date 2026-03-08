import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { FigmaImportPayload } from '@adorable/shared-types';
import { getServerUrl } from './server-url';

export interface FigmaUser {
  id: string;
  handle: string;
  email: string;
  img_url?: string;
}

export interface FigmaStatus {
  configured: boolean;
  user?: FigmaUser;
  error?: string;
}

export interface FigmaFileInfo {
  name: string;
  lastModified: string;
  thumbnailUrl?: string;
  pages: FigmaPageInfo[];
}

export interface FigmaPageInfo {
  id: string;
  name: string;
  type: string;
  children: FigmaNodeInfo[];
}

export interface FigmaNodeInfo {
  id: string;
  name: string;
  type: string;
  bounds?: {
    width: number;
    height: number;
  };
  children?: FigmaNodeInfo[];
}

@Injectable({
  providedIn: 'root'
})
export class FigmaService {
  private http = inject(HttpClient);
  private apiUrl = getServerUrl() + '/api/figma';

  // Reactive state
  status = signal<FigmaStatus>({ configured: false });
  loading = signal(false);
  currentFile = signal<FigmaFileInfo | null>(null);
  selectedNodes = signal<Set<string>>(new Set());

  /**
   * Check if Figma PAT is configured
   */
  checkStatus(): Observable<FigmaStatus> {
    this.loading.set(true);
    return this.http.get<FigmaStatus>(`${this.apiUrl}/status`).pipe(
      tap(status => {
        this.status.set(status);
        this.loading.set(false);
      }),
      catchError(err => {
        this.loading.set(false);
        this.status.set({ configured: false, error: err.message });
        return of({ configured: false, error: err.message });
      })
    );
  }

  /**
   * Parse a Figma URL to extract the file key
   */
  parseUrl(url: string): Observable<{ fileKey: string }> {
    return this.http.get<{ fileKey: string }>(`${this.apiUrl}/parse-url`, {
      params: { url }
    });
  }

  /**
   * Get file structure (pages and frames)
   */
  getFile(fileKey: string): Observable<FigmaFileInfo> {
    this.loading.set(true);
    return this.http.get<FigmaFileInfo>(`${this.apiUrl}/files/${fileKey}`).pipe(
      tap(file => {
        this.currentFile.set(file);
        this.selectedNodes.set(new Set());
        this.loading.set(false);
      }),
      catchError(err => {
        this.loading.set(false);
        throw err;
      })
    );
  }

  /**
   * Get specific node details
   */
  getNodes(fileKey: string, nodeIds: string[]): Observable<any> {
    return this.http.get(`${this.apiUrl}/files/${fileKey}/nodes`, {
      params: { ids: nodeIds.join(',') }
    });
  }

  /**
   * Import selected nodes as JSON + images
   */
  importSelection(fileKey: string, nodeIds: string[], options?: { scale?: number; format?: string }): Observable<FigmaImportPayload> {
    this.loading.set(true);
    return this.http.post<FigmaImportPayload>(`${this.apiUrl}/import`, {
      fileKey,
      nodeIds,
      ...options
    }).pipe(
      tap(() => this.loading.set(false)),
      catchError(err => {
        this.loading.set(false);
        throw err;
      })
    );
  }

  /**
   * Toggle node selection
   */
  toggleNode(nodeId: string): void {
    const current = new Set(this.selectedNodes());
    if (current.has(nodeId)) {
      current.delete(nodeId);
    } else {
      current.add(nodeId);
    }
    this.selectedNodes.set(current);
  }

  /**
   * Select all nodes in a page
   */
  selectAllInPage(page: FigmaPageInfo): void {
    const current = new Set(this.selectedNodes());
    const nodeIds = this.collectNodeIds(page.children);
    nodeIds.forEach(id => current.add(id));
    this.selectedNodes.set(current);
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    this.selectedNodes.set(new Set());
  }

  /**
   * Clear current file
   */
  clearFile(): void {
    this.currentFile.set(null);
    this.selectedNodes.set(new Set());
  }

  /**
   * Recursively collect all node IDs from a tree
   */
  private collectNodeIds(nodes: FigmaNodeInfo[]): string[] {
    const ids: string[] = [];
    for (const node of nodes) {
      ids.push(node.id);
      if (node.children) {
        ids.push(...this.collectNodeIds(node.children));
      }
    }
    return ids;
  }
}
