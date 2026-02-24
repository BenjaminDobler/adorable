import { Routes, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
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
    path: 'editor/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./workspace/workspace.component').then(m => m.WorkspaceComponent)
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  }
];
