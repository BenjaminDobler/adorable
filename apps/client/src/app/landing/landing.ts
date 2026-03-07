import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class LandingComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  githubUrl = 'https://github.com/BenjaminDobler/adorable';
  desktopDownloadUrl = 'https://github.com/BenjaminDobler/adorable/releases/latest';

  screenshots = ['screenshot-1.png', 'screenshot-2.png'];
  activeIndex = signal(0);

  constructor() {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  ngOnInit() {
    this.intervalId = setInterval(() => {
      this.activeIndex.set((this.activeIndex() + 1) % this.screenshots.length);
    }, 5000);
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}
