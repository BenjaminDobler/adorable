import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SkillReference {
  name: string;
  path: string;
  content: string;
}

export interface Skill {
  name: string;
  description: string;
  instructions: string;
  triggers?: string[];
  sourcePath?: string;

  // skills.sh compatible fields
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];

  // Enhanced skill support
  references?: SkillReference[];
}

@Injectable({
  providedIn: 'root'
})
export class SkillsService {
  private http = inject(HttpClient);
  private apiUrl = ((window as any).electronAPI?.serverUrl || 'http://localhost:3333') + '/api';

  getSkills(projectId?: string): Observable<Skill[]> {
    let url = `${this.apiUrl}/skills`;
    if (projectId) {
      url += `?projectId=${projectId}`;
    }
    return this.http.get<Skill[]>(url);
  }

  saveSkill(skill: Partial<Skill>): Observable<any> {
    return this.http.post(`${this.apiUrl}/skills`, skill);
  }

  deleteSkill(name: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/skills/${name}`);
  }

  /**
   * Install skills from a GitHub repository using skills.sh format
   * @param repo GitHub repo in format "owner/repo" or full URL
   * @param skillName Optional specific skill to install
   * @param global Install to user directory instead of project
   */
  installFromGitHub(repo: string, skillName?: string, global?: boolean): Observable<{ success: boolean; installed: string[] }> {
    return this.http.post<{ success: boolean; installed: string[] }>(`${this.apiUrl}/skills/install`, {
      repo,
      skillName,
      global
    });
  }

  /**
   * List skills available in a GitHub repository
   */
  listFromGitHub(repo: string): Observable<{ skills: { name: string; description: string }[] }> {
    return this.http.get<{ skills: { name: string; description: string }[] }>(
      `${this.apiUrl}/skills/list-remote?repo=${encodeURIComponent(repo)}`
    );
  }
}
