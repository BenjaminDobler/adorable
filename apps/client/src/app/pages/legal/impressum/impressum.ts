import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-impressum',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './impressum.html',
  styleUrl: './impressum.scss',
})
export class ImpressumComponent {
  private authService = inject(AuthService);
  backLink = this.authService.isAuthenticated() ? '/dashboard' : '/login';
}
