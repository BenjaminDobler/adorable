import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../services/api';
import { AuthService } from '../services/auth';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private router = inject(Router);

  projects = signal<any[]>([]);
  loading = signal(true);

  constructor() {
    this.loadProjects();
  }

  loadProjects() {
    this.apiService.listProjects().subscribe({
      next: (list) => {
        this.projects.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  createProject() {
    const name = prompt('Enter project name:');
    if (name) {
      this.router.navigate(['/editor', 'new'], { queryParams: { name } });
    }
  }

  deleteProject(id: string, event: Event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this project?')) {
      this.apiService.deleteProject(id).subscribe(() => this.loadProjects());
    }
  }

  logout() {
    this.authService.logout();
  }
}