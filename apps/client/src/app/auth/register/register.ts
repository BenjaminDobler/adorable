import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);

  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  inviteCode = '';
  error = signal('');
  successMessage = signal('');
  loading = signal(false);
  requireInviteCode = signal(false);
  githubLoginEnabled = signal(false);
  googleLoginEnabled = signal(false);

  ngOnInit() {
    this.authService.getRegistrationConfig().subscribe({
      next: (config) => {
        this.requireInviteCode.set(config.registrationMode === 'invite-only');
        this.githubLoginEnabled.set(config.githubLoginEnabled);
        this.googleLoginEnabled.set(config.googleLoginEnabled);
      },
      error: () => {} // Fail silently — default to open registration
    });
  }

  socialLogin(provider: 'github' | 'google') {
    this.authService.getSocialAuthUrl(provider).subscribe({
      next: (res) => {
        window.location.href = res.url;
      },
      error: () => {
        this.error.set('Failed to start social login. Please try again.');
      },
    });
  }

  register() {
    if (this.password.length < 8) {
      this.error.set('Password must be at least 8 characters');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.successMessage.set('');

    const payload: any = {
      name: this.name,
      email: this.email,
      password: this.password,
      confirmPassword: this.confirmPassword,
    };
    if (this.inviteCode.trim()) {
      payload.inviteCode = this.inviteCode.trim();
    }

    this.authService.register(payload).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (res: any) => {
        if (res.requiresVerification) {
          this.successMessage.set(res.message || 'Account created. Please check your email to verify your account.');
        } else {
          this.toastService.show('Welcome! Your account has been created.', 'success');
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err) => {
        this.error.set(err.error?.error || err.message || 'Registration failed. Please try again.');
      }
    });
  }
}
