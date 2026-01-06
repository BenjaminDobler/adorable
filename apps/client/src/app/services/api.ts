import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GenerateResponse } from '@adorable/shared-types';

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

      

    

  

    saveProject(name: string, files: any) {

      return this.http.post<{ message: string, name: string }>(`${this.apiUrl}/projects`, { name, files });

    }

  

    listProjects() {

      return this.http.get<string[]>(`${this.apiUrl}/projects`);

    }

  

      loadProject(name: string) {

  

        return this.http.get<any>(`${this.apiUrl}/projects/${name}`);

  

      }

  

    

  

      getProfile() {

  

        return this.http.get<any>(`${this.apiUrl}/profile`);

  

      }

  

    

  

      updateProfile(data: { name?: string, settings?: any }) {

  

        return this.http.post<any>(`${this.apiUrl}/profile`, data);

  

      }

  

    }

  

    

  