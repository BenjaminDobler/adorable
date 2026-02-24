import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private http = inject(HttpClient);
  user = signal<AdminUser | null>(null);
  isAuthenticated = computed(() => !!this.user() && this.user()!.role === 'admin');

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const token = localStorage.getItem('adorable_token');
    const userJson = localStorage.getItem('adorable_user');
    if (!token || !userJson) return;

    try {
      const user = JSON.parse(userJson) as AdminUser;
      if (user.role === 'admin') {
        this.user.set(user);
      }
    } catch {
      // Invalid stored data
    }
  }

  getToken(): string | null {
    return localStorage.getItem('adorable_token');
  }

  login(email: string, password: string) {
    return this.http.post<{ token: string; user: AdminUser }>('/api/auth/login', { email, password });
  }

  handleLoginResponse(res: { token: string; user: AdminUser }): boolean {
    if (res.user.role !== 'admin') return false;
    localStorage.setItem('adorable_token', res.token);
    localStorage.setItem('adorable_user', JSON.stringify(res.user));
    this.user.set(res.user);
    return true;
  }

  logout() {
    localStorage.removeItem('adorable_token');
    localStorage.removeItem('adorable_user');
    this.user.set(null);
  }
}
