import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';

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
  private toastService = inject(ToastService);
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
      error: () => {
        this.toastService.show('Failed to load projects', 'error');
        this.loading.set(false);
      }
    });
  }

  createProject() {
    this.router.navigate(['/editor', 'new'], { queryParams: { name: 'New Project' } });
  }

  deleteProject(id: string, event: Event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this project?')) {
      this.apiService.deleteProject(id).subscribe({
        next: () => {
          this.toastService.show('Project deleted', 'success');
          this.loadProjects();
        },
        error: () => this.toastService.show('Failed to delete project', 'error')
      });
    }
  }

  logout() {
    this.authService.logout();
  }
}