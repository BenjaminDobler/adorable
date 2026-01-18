import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { ProjectService } from '../services/project';
import { ContainerEngine } from '../services/container-engine';
import { FormsModule } from '@angular/forms';
import { SmartContainerEngine } from '../services/smart-container.engine';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class NavbarComponent {
  public authService = inject(AuthService);
  public projectService = inject(ProjectService);
  public webContainerService = inject(ContainerEngine);
  private router = inject(Router);

  isProjectView() {
    return this.router.url.startsWith('/editor/');
  }

  logout() {
    this.authService.logout();
  }

  toggleEngine(event: Event) {
    const select = event.target as HTMLSelectElement;
    if (this.webContainerService instanceof SmartContainerEngine) {
       this.webContainerService.setMode(select.value as 'browser' | 'local');
       this.projectService.reloadPreview(this.projectService.files());
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}