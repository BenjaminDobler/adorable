import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';

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

  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  inviteCode = '';
  error = '';
  successMessage = '';
  loading = false;
  requireInviteCode = signal(false);

  ngOnInit() {
    this.authService.getRegistrationConfig().subscribe({
      next: (config) => {
        this.requireInviteCode.set(config.registrationMode === 'invite-only');
      },
      error: () => {} // Fail silently — default to open registration
    });
  }

  register() {
    if (this.password.length < 8) {
      this.error = 'Password must be at least 8 characters';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }

    this.loading = true;
    this.error = '';
    this.successMessage = '';

    const payload: any = {
      name: this.name,
      email: this.email,
      password: this.password,
      confirmPassword: this.confirmPassword,
    };
    if (this.inviteCode) {
      payload.inviteCode = this.inviteCode;
    }

    this.authService.register(payload).subscribe({
      next: (res: any) => {
        if (res.requiresVerification) {
          this.successMessage = res.message || 'Account created. Please check your email to verify your account.';
          this.loading = false;
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err) => {
        this.error = err.error?.error || 'Registration failed';
        this.loading = false;
      }
    });
  }
}
