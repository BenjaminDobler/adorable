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
  private apiUrl = ((window as any).electronAPI?.serverUrl || 'http://localhost:3333') + '/api/auth';
  private baseApiUrl = ((window as any).electronAPI?.serverUrl || 'http://localhost:3333') + '/api';

  currentUser = signal<AuthResponse['user'] | null>(null);
  token = signal<string | null>(localStorage.getItem('adorable_token'));

  // Signal to track if desktop auto-login is complete
  desktopAuthReady = signal<boolean>(false);

  constructor() {
    const storedUser = localStorage.getItem('adorable_user');
    if (storedUser) {
      this.currentUser.set(JSON.parse(storedUser));
    }

    // Desktop auto-login
    this.tryDesktopAutoLogin();
  }

  /**
   * Attempts auto-login in desktop mode by getting the pre-generated token
   * from the Electron main process.
   */
  private async tryDesktopAutoLogin() {
    const electronAPI = (window as any).electronAPI;

    // Not in desktop mode - mark as ready immediately
    if (!electronAPI?.isDesktop) {
      this.desktopAuthReady.set(true);
      return;
    }

    // In desktop mode, always use the fresh local user token
    // This ensures we use the correct local user even if there's an old token
    try {
      const token = await electronAPI.getLocalUserToken();
      if (token) {
        // Store token (replaces any existing token)
        localStorage.setItem('adorable_token', token);
        this.token.set(token);

        // Fetch user profile to get user details
        const user = await this.fetchProfile(token);
        if (user) {
          localStorage.setItem('adorable_user', JSON.stringify(user));
          this.currentUser.set(user);
          console.log('[Auth] Desktop auto-login successful');
        }
      }
    } catch (e) {
      console.error('[Auth] Desktop auto-login failed:', e);
    }

    this.desktopAuthReady.set(true);
  }

  /**
   * Fetches the user profile from the API.
   */
  private async fetchProfile(token: string): Promise<AuthResponse['user'] | null> {
    try {
      const response = await fetch(`${this.baseApiUrl}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        return response.json();
      }
    } catch (e) {
      console.error('[Auth] Failed to fetch profile:', e);
    }
    return null;
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
    this.http.post(`${this.apiUrl}/logout`, {}).subscribe({
      next: () => this.finalizeLogout(),
      error: () => this.finalizeLogout() // Logout anyway on error
    });
  }

  private finalizeLogout() {
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