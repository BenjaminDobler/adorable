import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import {
  GitHubConnection,
  GitHubRepository,
  GitHubProjectSync,
} from '@adorable/shared-types';

@Injectable({
  providedIn: 'root',
})
export class GitHubService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3333/api/github';

  // State
  connection = signal<GitHubConnection>({ connected: false });
  loading = signal(false);
  repositories = signal<GitHubRepository[]>([]);

  /**
   * Initiate GitHub OAuth flow
   */
  connect(): void {
    this.loading.set(true);
    this.http.get<{ url: string }>(`${this.apiUrl}/auth`).subscribe({
      next: (res) => {
        // Redirect to GitHub OAuth
        window.location.href = res.url;
      },
      error: (err) => {
        console.error('Failed to get GitHub auth URL:', err);
        this.loading.set(false);
      },
    });
  }

  /**
   * Get current GitHub connection status
   */
  getConnection(): Observable<GitHubConnection> {
    return this.http.get<GitHubConnection>(`${this.apiUrl}/connection`).pipe(
      tap((conn) => this.connection.set(conn)),
      catchError(() => of({ connected: false }))
    );
  }

  /**
   * Disconnect GitHub account
   */
  disconnect(): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/disconnect`, {}).pipe(
      tap(() => this.connection.set({ connected: false }))
    );
  }

  /**
   * List user's GitHub repositories
   */
  listRepositories(): Observable<GitHubRepository[]> {
    this.loading.set(true);
    return this.http.get<GitHubRepository[]>(`${this.apiUrl}/repos`).pipe(
      tap((repos) => {
        this.repositories.set(repos);
        this.loading.set(false);
      }),
      catchError((err) => {
        this.loading.set(false);
        throw err;
      })
    );
  }

  /**
   * Create a new GitHub repository
   */
  createRepository(
    name: string,
    isPrivate: boolean = true,
    description?: string
  ): Observable<GitHubRepository> {
    return this.http.post<GitHubRepository>(`${this.apiUrl}/repos`, {
      name,
      isPrivate,
      description,
    });
  }

  /**
   * Connect a project to a GitHub repository
   */
  connectProject(
    projectId: string,
    repoFullName: string
  ): Observable<{ success: boolean; repoFullName: string; branch: string }> {
    return this.http.post<{ success: boolean; repoFullName: string; branch: string }>(
      `${this.apiUrl}/connect/${projectId}`,
      { repoFullName }
    );
  }

  /**
   * Disconnect a project from GitHub
   */
  disconnectProject(projectId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${this.apiUrl}/disconnect/${projectId}`,
      {}
    );
  }

  /**
   * Get sync status for a project
   */
  getSyncStatus(projectId: string): Observable<GitHubProjectSync> {
    return this.http.get<GitHubProjectSync>(`${this.apiUrl}/sync/${projectId}`);
  }

  /**
   * Push project files to GitHub
   */
  pushToGitHub(
    projectId: string,
    message?: string
  ): Observable<{ success: boolean; commitSha: string }> {
    return this.http.post<{ success: boolean; commitSha: string }>(
      `${this.apiUrl}/sync/${projectId}/push`,
      { message }
    );
  }

  /**
   * Pull latest files from GitHub
   */
  pullFromGitHub(
    projectId: string
  ): Observable<{ success: boolean; commitSha: string; files: any }> {
    return this.http.post<{ success: boolean; commitSha: string; files: any }>(
      `${this.apiUrl}/sync/${projectId}/pull`,
      {}
    );
  }
}
