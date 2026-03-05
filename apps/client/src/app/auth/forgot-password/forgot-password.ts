import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPasswordComponent {
  private authService = inject(AuthService);

  email = '';
  error = signal('');
  successMessage = signal('');
  loading = signal(false);

  submit() {
    if (!this.email) {
      this.error.set('Please enter your email address');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.successMessage.set('');

    this.authService.forgotPassword(this.email).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
      },
      error: (err) => {
        this.error.set(err.error?.error || err.message || 'Failed to send reset email');
      },
    });
  }
}
