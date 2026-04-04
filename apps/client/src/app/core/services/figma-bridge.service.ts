import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FigmaImportPayload, FigmaSelection } from '@adorable/shared-types';
import { getServerUrl } from './server-url';

@Injectable({
  providedIn: 'root'
})
export class FigmaBridgeService implements OnDestroy {
  private http = inject(HttpClient);
  private apiUrl = getServerUrl() + '/api/figma/bridge';
  private eventSource: EventSource | null = null;

  // Reactive state
  connected = signal(false);
  fileName = signal<string | null>(null);
  fileKey = signal<string | null>(null);
  currentSelection = signal<FigmaSelection[]>([]);
  connectionCode = signal<string | null>(null);
  generatingCode = signal(false);
  nodeAnnotations = signal(false);

  /**
   * Check current bridge connection status
   */
  checkStatus(): void {
    this.http.get<{ connected: boolean; fileKey?: string; fileName?: string }>(
      `${this.apiUrl}/status`
    ).subscribe({
      next: (status) => {
        this.connected.set(status.connected);
        this.fileName.set(status.fileName || null);
        this.fileKey.set(status.fileKey || null);
      },
      error: () => {
        this.connected.set(false);
      }
    });
  }

  /**
   * Generate a connection code for the Figma plugin
   */
  generateConnectionCode(): void {
    this.generatingCode.set(true);
    this.http.post<{ code: string }>(`${this.apiUrl}/token`, {}).subscribe({
      next: (result) => {
        this.connectionCode.set(result.code);
        this.generatingCode.set(false);
      },
      error: () => {
        this.generatingCode.set(false);
      }
    });
  }

  /**
   * Start listening for bridge events via SSE
   */
  startListening(): void {
    if (this.eventSource) return;

    // EventSource doesn't support Authorization headers, so pass token as query param
    const token = localStorage.getItem('adorable_token');
    const url = `${this.apiUrl}/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'figma:connected':
            this.connected.set(true);
            this.fileName.set(data.fileName);
            this.fileKey.set(data.fileKey);
            this.connectionCode.set(null); // Clear code after successful connection
            break;
          case 'figma:disconnected':
            this.connected.set(false);
            this.fileName.set(null);
            this.fileKey.set(null);
            this.currentSelection.set([]);
            break;
          case 'figma:selection_update':
            this.currentSelection.set(data.selection || []);
            break;
        }
      } catch { /* ignore parse errors */ }
    };

    this.eventSource.onerror = () => {
      // EventSource auto-reconnects, just update status
      this.connected.set(false);
    };
  }

  /**
   * Stop listening for bridge events
   */
  stopListening(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Grab current Figma selection with images (returns FigmaImportPayload)
   */
  grabSelection(): Observable<FigmaImportPayload> {
    return this.http.post<FigmaImportPayload>(`${this.apiUrl}/grab-selection`, {});
  }

  /**
   * Fetch a Figma node's structure (dimensions, styles) for design comparison.
   * Returns the node data without images for fast lookup.
   */
  getNodeForComparison(nodeId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/get-node`, { nodeId, includeImage: false });
  }

  ngOnDestroy(): void {
    this.stopListening();
  }
}
