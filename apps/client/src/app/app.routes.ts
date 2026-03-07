import { Routes, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './services/auth';

/**
 * Guard that redirects away from login/register in desktop mode.
 * Desktop users are auto-logged in and don't need these pages.
 */
const desktopRedirectGuard: CanActivateFn = () => {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.isDesktop) {
    // In desktop mode, redirect to dashboard instead of showing login/register
    return inject(Router).createUrlTree(['/dashboard']);
  }
  return true;
};

/**
 * Guard that protects routes requiring authentication.
 * In desktop mode, waits for auto-login to complete before checking.
 */
const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const electronAPI = (window as any).electronAPI;

  // In desktop mode, wait for auto-login to complete
  if (electronAPI?.isDesktop && !authService.desktopAuthReady()) {
    // Wait up to 2 seconds for auto-login
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (authService.desktopAuthReady()) break;
    }
  }

  if (authService.isAuthenticated()) {
    return true;
  }

  // Desktop mode should always be authenticated after auto-login
  if (electronAPI?.isDesktop) {
    console.error('[Auth] Desktop auto-login failed - user not authenticated');
  }

  return router.parseUrl('/login');
};

/**
 * Guard that checks cloud editor access before allowing entry to the editor.
 * Desktop users always pass. Cloud users are checked against the server allowlist.
 */
const cloudEditorGuard: CanActivateFn = async () => {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.isDesktop) return true;

  const authService = inject(AuthService);
  const router = inject(Router);

  try {
    const result = await firstValueFrom(authService.checkCloudAccess());
    if (result.allowed) return true;
  } catch {
    // If the check fails, allow through (fail open — the generate-stream endpoint has its own guard)
    return true;
  }

  return router.parseUrl('/cloud-blocked');
};

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [desktopRedirectGuard],
    loadComponent: () => import('./auth/login/login').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    canActivate: [desktopRedirectGuard],
    loadComponent: () => import('./auth/register/register').then(m => m.RegisterComponent)
  },
  {
    path: 'forgot-password',
    canActivate: [desktopRedirectGuard],
    loadComponent: () => import('./auth/forgot-password/forgot-password').then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    canActivate: [desktopRedirectGuard],
    loadComponent: () => import('./auth/reset-password/reset-password').then(m => m.ResetPasswordComponent)
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./dashboard/dashboard').then(m => m.DashboardComponent)
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./profile/profile').then(m => m.ProfileComponent)
  },
  {
    path: 'kit-builder/new',
    canActivate: [authGuard],
    loadComponent: () => import('./dashboard/kit-builder/kit-builder').then(m => m.KitBuilderComponent)
  },
  {
    path: 'kit-builder/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./dashboard/kit-builder/kit-builder').then(m => m.KitBuilderComponent)
  },
  {
    path: 'teams/:teamId',
    canActivate: [authGuard],
    loadComponent: () => import('./team-settings/team-settings').then(m => m.TeamSettingsComponent)
  },
  {
    path: 'analytics',
    canActivate: [authGuard],
    loadComponent: () => import('./analytics/analytics').then(m => m.AnalyticsComponent)
  },
  {
    path: 'cloud-blocked',
    canActivate: [authGuard],
    loadComponent: () => import('./cloud-blocked/cloud-blocked').then(m => m.CloudBlockedComponent)
  },
  {
    path: 'editor/:id',
    canActivate: [authGuard, cloudEditorGuard],
    loadComponent: () => import('./workspace/workspace.component').then(m => m.WorkspaceComponent)
  },
  {
    path: 'impressum',
    loadComponent: () => import('./legal/impressum/impressum').then(m => m.ImpressumComponent)
  },
  {
    path: 'privacy',
    loadComponent: () => import('./legal/privacy/privacy').then(m => m.PrivacyComponent)
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
