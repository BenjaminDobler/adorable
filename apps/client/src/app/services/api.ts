import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GenerateResponse } from '@adorable/shared-types';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3333/api';

  generate(prompt: string, previousFiles?: any, options?: { provider?: string, apiKey?: string, model?: string, images?: string[] }) {
    return this.http.post<GenerateResponse>(`${this.apiUrl}/generate`, { 
      prompt, 
      previousFiles,
      ...options
    });
  }

  generateStream(prompt: string, previousFiles?: any, options?: { provider?: string, apiKey?: string, model?: string, images?: string[] }): Observable<any> {
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

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  observer.next(data);
                } catch (e) {
                  // Partial JSON, skip or wait
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

  saveProject(name: string, files: any, messages?: any[], id?: string, thumbnail?: string) {
    return this.http.post<any>(`${this.apiUrl}/projects`, { name, files, messages, id, thumbnail });
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

  getProfile() {
    return this.http.get<any>(`${this.apiUrl}/profile`);
  }

  updateProfile(data: { name?: string, settings?: any }) {
    return this.http.post<any>(`${this.apiUrl}/profile`, data);
  }

  getModels(provider: string, apiKey: string) {
    return this.http.get<string[]>(`${this.apiUrl}/models/${provider}`, {
      headers: { 'x-api-key': apiKey }
    });
  }

  publish(projectId: string, files: any) {
    return this.http.post<any>(`${this.apiUrl}/publish/${projectId}`, { files });
  }
}

  