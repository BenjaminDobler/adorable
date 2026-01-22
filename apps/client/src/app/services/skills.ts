import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Skill {
  name: string;
  description: string;
  instructions: string;
  triggers?: string[];
  sourcePath?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SkillsService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3333/api';

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
}
