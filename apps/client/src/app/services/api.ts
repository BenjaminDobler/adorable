import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GenerateResponse } from '@adorable/shared-types';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3333/api';

    generate(prompt: string, previousFiles?: any) {

      return this.http.post<GenerateResponse>(`${this.apiUrl}/generate`, { prompt, previousFiles });

    }

  

    saveProject(name: string, files: any) {

      return this.http.post<{ message: string, name: string }>(`${this.apiUrl}/projects`, { name, files });

    }

  

    listProjects() {

      return this.http.get<string[]>(`${this.apiUrl}/projects`);

    }

  

    loadProject(name: string) {

      return this.http.get<any>(`${this.apiUrl}/projects/${name}`);

    }

  }

  