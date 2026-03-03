import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = '';
  password = '';
  error = '';
  successMessage = '';
  loading = false;

  githubLoginEnabled = signal(false);
  googleLoginEnabled = signal(false);

  ngOnInit() {
    // Handle email verification redirect
    const verified = this.route.snapshot.queryParamMap.get('verified');
    if (verified === 'true') {
      this.successMessage = 'Email verified successfully! You can now log in.';
    }

    // Handle password reset redirect
    const reset = this.route.snapshot.queryParamMap.get('reset');
    if (reset === 'true') {
      this.successMessage = 'Password reset successfully! You can now log in with your new password.';
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
        this.error = 'Could not retrieve email from your social account. Please ensure your email is public or verified.';
      } else if (socialError === 'account_disabled') {
        this.error = 'Your account has been disabled. Contact an administrator.';
      } else {
        this.error = 'Social login failed. Please try again.';
      }
    }

    // Fetch config to show/hide social buttons
    this.authService.getRegistrationConfig().subscribe({
      next: (config) => {
        this.githubLoginEnabled.set(config.githubLoginEnabled);
        this.googleLoginEnabled.set(config.googleLoginEnabled);
      },
    });
  }

  private async handleSocialCallback(token: string) {
    this.loading = true;
    const success = await this.authService.handleSocialCallback(token);
    if (success) {
      this.router.navigate(['/dashboard']);
    } else {
      this.error = 'Social login failed. Please try again.';
      this.loading = false;
    }
  }

  login() {
    this.loading = true;
    this.error = '';
    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.error = err.error?.error || 'Login failed';
        this.loading = false;
      }
    });
  }

  socialLogin(provider: 'github' | 'google') {
    this.authService.getSocialAuthUrl(provider).subscribe({
      next: (res) => {
        window.location.href = res.url;
      },
      error: () => {
        this.error = 'Failed to start social login. Please try again.';
      },
    });
  }
}
