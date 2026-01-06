import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = 'http://localhost:3333/api/auth';

  currentUser = signal<AuthResponse['user'] | null>(null);
  token = signal<string | null>(localStorage.getItem('adorable_token'));

  constructor() {
    const storedUser = localStorage.getItem('adorable_user');
    if (storedUser) {
      this.currentUser.set(JSON.parse(storedUser));
    }
  }

  register(data: any) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data).pipe(
      tap(res => this.handleAuth(res))
    );
  }

  login(data: any) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, data).pipe(
      tap(res => this.handleAuth(res))
    );
  }

  logout() {
    this.currentUser.set(null);
    this.token.set(null);
    localStorage.removeItem('adorable_token');
    localStorage.removeItem('adorable_user');
    this.router.navigate(['/login']);
  }

  isAuthenticated() {
    return !!this.token();
  }

  private handleAuth(res: AuthResponse) {
    this.token.set(res.token);
    this.currentUser.set(res.user);
    localStorage.setItem('adorable_token', res.token);
    localStorage.setItem('adorable_user', JSON.stringify(res.user));
  }
}