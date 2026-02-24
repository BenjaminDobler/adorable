import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminAuthService } from './services/auth';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  auth = inject(AdminAuthService);

  email = '';
  password = '';
  loginError = '';
  loginLoading = false;

  login() {
    this.loginLoading = true;
    this.loginError = '';
    this.auth.login(this.email, this.password).subscribe({
      next: (res) => {
        const ok = this.auth.handleLoginResponse(res);
        if (!ok) {
          this.loginError = 'This account does not have admin access.';
        }
        this.loginLoading = false;
      },
      error: (err) => {
        this.loginError = err.error?.error || 'Login failed';
        this.loginLoading = false;
      },
    });
  }
}
