import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminAuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private http = inject(HttpClient);
  private auth = inject(AdminAuthService);
  private baseUrl = '/api/admin';

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken()}` });
  }

  // Users
  getUsers() {
    return this.http.get<any[]>(`${this.baseUrl}/users`, { headers: this.headers() });
  }

  updateUser(id: string, data: { isActive?: boolean; role?: string }) {
    return this.http.patch<any>(`${this.baseUrl}/users/${id}`, data, { headers: this.headers() });
  }

  deleteUser(id: string) {
    return this.http.delete<any>(`${this.baseUrl}/users/${id}`, { headers: this.headers() });
  }

  // Invites
  getInvites() {
    return this.http.get<any[]>(`${this.baseUrl}/invites`, { headers: this.headers() });
  }

  createInvite() {
    return this.http.post<any>(`${this.baseUrl}/invites`, {}, { headers: this.headers() });
  }

  deleteInvite(id: string) {
    return this.http.delete<any>(`${this.baseUrl}/invites/${id}`, { headers: this.headers() });
  }

  // Teams
  getTeams() {
    return this.http.get<any[]>(`${this.baseUrl}/teams`, { headers: this.headers() });
  }

  getTeam(id: string) {
    return this.http.get<any>(`${this.baseUrl}/teams/${id}`, { headers: this.headers() });
  }

  deleteTeam(id: string) {
    return this.http.delete<any>(`${this.baseUrl}/teams/${id}`, { headers: this.headers() });
  }

  // Config
  getConfig() {
    return this.http.get<Record<string, string>>(`${this.baseUrl}/config`, { headers: this.headers() });
  }

  updateConfig(data: Record<string, string>) {
    return this.http.patch<any>(`${this.baseUrl}/config`, data, { headers: this.headers() });
  }

  // Stats
  getStats() {
    return this.http.get<any>(`${this.baseUrl}/stats`, { headers: this.headers() });
  }
}
