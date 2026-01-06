import { Component, inject, signal, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from './services/api';
import { WebContainerService } from './services/web-container';
import { BASE_FILES } from './base-project';
import { SettingsComponent, AppSettings } from './settings/settings';
import { ProfileComponent } from './profile/profile';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

@Pipe({
  name: 'safeUrl',
  standalone: true
})
export class SafeUrlPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);
  transform(url: string | null) {
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  }
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, SafeUrlPipe, SettingsComponent, ProfileComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {
  private apiService = inject(ApiService);
  public webContainerService = inject(WebContainerService);

  prompt = '';
  loading = signal(false);
  currentFiles: any = null; // Track current state
  
  // Project persistence state
  projectName = '';
  projects = signal<string[]>([]);
  showLoadMenu = false;
  
  // Settings state
  showSettings = false;
  appSettings: AppSettings = {
    provider: 'anthropic',
    apiKey: '',
    model: ''
  };

  // User profile state
  showProfile = false;
  userProfile = signal<any>(null);

  // Selection state
  isSelecting = false;
  selectionRect: { x: number, y: number, width: number, height: number } | null = null;
  startPoint: { x: number, y: number } | null = null;
  attachedImage: string | null = null;

  constructor() {
    this.refreshProjectList();
    this.fetchProfile();
    const stored = localStorage.getItem('adorable-settings');
    if (stored) {
      this.appSettings = JSON.parse(stored);
    }

    // Listen for screenshot response
    window.addEventListener('message', (event) => {
      if (event.data.type === 'CAPTURE_RES') {
        this.attachedImage = event.data.image;
        this.isSelecting = false;
        this.selectionRect = null;
      }
    });
  }

  fetchProfile() {
    this.apiService.getProfile().subscribe(profile => this.userProfile.set(profile));
  }

  onProfileSaved(data: { name: string }) {
    this.apiService.updateProfile(data).subscribe(updated => {
      this.userProfile.set(updated);
      this.showProfile = false;
    });
  }
  
  // Selection Logic
  startSelection() {
    this.isSelecting = true;
    this.attachedImage = null;
  }

  onMouseDown(event: MouseEvent) {
    if (!this.isSelecting) return;
    this.startPoint = { x: event.clientX, y: event.clientY };
    this.selectionRect = { x: event.clientX, y: event.clientY, width: 0, height: 0 };
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isSelecting || !this.startPoint) return;
    
    const currentX = event.clientX;
    const currentY = event.clientY;
    
    const width = Math.abs(currentX - this.startPoint.x);
    const height = Math.abs(currentY - this.startPoint.y);
    const x = Math.min(currentX, this.startPoint.x);
    const y = Math.min(currentY, this.startPoint.y);
    
    this.selectionRect = { x, y, width, height };
  }

  onMouseUp() {
    if (!this.isSelecting || !this.selectionRect) return;
    if (this.selectionRect.width < 10 || this.selectionRect.height < 10) {
      this.isSelecting = false;
      this.selectionRect = null;
      this.startPoint = null;
      return;
    }
    
    // Capture phase
    this.captureSelection(this.selectionRect);
    this.startPoint = null;
  }

  captureSelection(rect: { x: number, y: number, width: number, height: number }) {
    // We need to convert screen coordinates to Iframe-relative coordinates
    const iframe = document.querySelector('iframe');
    if (!iframe) return;

    const iframeRect = iframe.getBoundingClientRect();
    
    // Calculate relative to iframe
    const relX = rect.x - iframeRect.left;
    const relY = rect.y - iframeRect.top;
    
    // Send message to iframe to capture
    iframe.contentWindow?.postMessage({
      type: 'CAPTURE_REQ',
      rect: { x: relX, y: relY, width: rect.width, height: rect.height }
    }, '*');
  }

  removeAttachment() {
    this.attachedImage = null;
  }

  refreshProjectList() {
    this.apiService.listProjects().subscribe(list => this.projects.set(list));
  }

  toggleLoadMenu() {
    this.showLoadMenu = !this.showLoadMenu;
    if (this.showLoadMenu) this.refreshProjectList();
  }
  
  toggleSettings() {
    this.showSettings = !this.showSettings;
  }
  
  onSettingsSaved(newSettings: AppSettings) {
    this.appSettings = newSettings;
    this.showSettings = false;
  }

  saveProject() {
    if (!this.projectName || !this.currentFiles) return;
    
    this.loading.set(true);
    this.apiService.saveProject(this.projectName, this.currentFiles).subscribe({
      next: () => {
        alert('Project saved!');
        this.loading.set(false);
        this.refreshProjectList();
      },
      error: (err) => {
        console.error(err);
        alert('Failed to save project');
        this.loading.set(false);
      }
    });
  }

  loadProject(name: string) {
    this.loading.set(true);
    this.showLoadMenu = false;
    this.projectName = name;

    this.apiService.loadProject(name).subscribe({
      next: async (files) => {
        this.currentFiles = files;
        
        // Remount base + loaded files
        const projectFiles = this.mergeFiles(BASE_FILES, files);
        
        try {
          await this.webContainerService.mount(projectFiles);
          const exitCode = await this.webContainerService.runInstall();
          if (exitCode === 0) {
            this.webContainerService.startDevServer();
          }
        } catch (err) {
          console.error(err);
        } finally {
          this.loading.set(false);
        }
      },
      error: (err) => {
        console.error(err);
        alert('Failed to load project');
        this.loading.set(false);
      }
    });
  }

  async downloadZip() {
    if (!this.currentFiles) return;
    
    this.loading.set(true);
    try {
      const zip = new JSZip();
      
      // Merge base files with current files to ensure we export a complete project
      const fullProject = this.mergeFiles(BASE_FILES, this.currentFiles);
      
      // Recursive function to add files to zip
      const addFilesToZip = (files: any, currentPath: string) => {
        for (const key in files) {
          const node = files[key];
          if (node.file) {
             zip.file(`${currentPath}${key}`, node.file.contents);
          } else if (node.directory) {
             addFilesToZip(node.directory, `${currentPath}${key}/`);
          }
        }
      };

      addFilesToZip(fullProject, '');

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${this.projectName || 'adorable-app'}.zip`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to create ZIP file');
    } finally {
      this.loading.set(false);
    }
  }

  async generate() {
    if (!this.prompt) return;

    this.loading.set(true);
    
    // Send current 'src' directory if it exists, for context
    const previousSrc = this.currentFiles?.['src'];

    this.apiService.generate(this.prompt, previousSrc, {
      provider: this.appSettings.provider,
      apiKey: this.appSettings.apiKey,
      model: this.appSettings.model,
      images: this.attachedImage ? [this.attachedImage] : undefined
    }).subscribe({
      next: async (res) => {
        try {
          this.attachedImage = null; // Clear image after sending
          // Merge generated files into the base project (or current state)
          // We always start from BASE to ensure config files exist, then overlay previous state, then new changes
          let base = BASE_FILES;
          if (this.currentFiles) {
             base = this.mergeFiles(base, this.currentFiles);
          }
          const projectFiles = this.mergeFiles(base, res.files);

          this.currentFiles = projectFiles; // Update state

          await this.webContainerService.mount(projectFiles);
          // Only install if it's the first run or dependencies changed (optimization: could be refined)
          const exitCode = await this.webContainerService.runInstall(); 
          if (exitCode === 0) {
            this.webContainerService.startDevServer();
          } else {
            console.error('Installation failed');
          }
        } catch (err) {
          console.error('WebContainer error:', err);
        } finally {
          this.loading.set(false);
        }
      },
      error: (err) => {
        console.error('API error:', err);
        this.loading.set(false);
      }
    });
  }

  // Helper to deep merge file structures
  private mergeFiles(base: any, generated: any): any {
    const result = { ...base };

    for (const key in generated) {
      if (generated[key].directory && result[key]?.directory) {
        // Recursive merge for directories
        result[key] = {
          directory: this.mergeFiles(result[key].directory, generated[key].directory)
        };
      } else {
        // Overwrite files
        result[key] = generated[key];
      }
    }

    return result;
  }
}