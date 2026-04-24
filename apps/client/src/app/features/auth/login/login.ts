import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  email = '';
  password = '';
  error = signal('');
  successMessage = signal('');
  loading = signal(false);

  githubLoginEnabled = signal(false);
  googleLoginEnabled = signal(false);

  constructor() {
    // Handle email verification redirect
    const verified = this.route.snapshot.queryParamMap.get('verified');
    if (verified === 'true') {
      this.successMessage.set('Email verified successfully! You can now log in.');
    }

    // Handle password reset redirect
    const reset = this.route.snapshot.queryParamMap.get('reset');
    if (reset === 'true') {
      this.successMessage.set('Password reset successfully! You can now log in with your new password.');
    }

    // Handle social login callback
    const social = this.route.snapshot.queryParamMap.get('social');
    const token = this.route.snapshot.queryParamMap.get('token');
    if (social === 'success' && token) {
      this.handleSocialCallback(token);
      return;
    }

    // Handle social login errors
    const socialError = this.route.snapshot.queryParamMap.get('social_error');
    if (socialError) {
      if (socialError === 'no_email') {
        this.error.set('Could not retrieve email from your social account. Please ensure your email is public or verified.');
      } else if (socialError === 'account_disabled') {
        this.error.set('Your account has been disabled. Contact an administrator.');
      } else {
        this.error.set('Social login failed. Please try again.');
      }
    }

    // Fetch config to show/hide social buttons
    this.authService.getRegistrationConfig().pipe(takeUntilDestroyed()).subscribe({
      next: (config) => {
        this.githubLoginEnabled.set(config.githubLoginEnabled);
        this.googleLoginEnabled.set(config.googleLoginEnabled);
      },
    });
  }

  private async handleSocialCallback(token: string) {
    this.loading.set(true);
    const success = await this.authService.handleSocialCallback(token);
    if (success) {
      this.router.navigate(['/dashboard']);
    } else {
      this.error.set('Social login failed. Please try again.');
      this.loading.set(false);
    }
  }

  login() {
    this.loading.set(true);
    this.error.set('');
    this.authService.login({ email: this.email, password: this.password }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.error.set(err.error?.error || err.message || 'Login failed. Please try again.');
      }
    });
  }

  socialLogin(provider: 'github' | 'google') {
    this.authService.getSocialAuthUrl(provider).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        window.location.href = res.url;
      },
      error: () => {
        this.error.set('Failed to start social login. Please try again.');
      },
    });
  }
}
