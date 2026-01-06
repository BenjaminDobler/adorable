import { Component, inject, signal, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from './services/api';
import { WebContainerService } from './services/web-container';
import { BASE_FILES } from './base-project';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ActivatedRoute, Router } from '@angular/router';

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
  imports: [CommonModule, FormsModule, SafeUrlPipe],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {
  private apiService = inject(ApiService);
  public webContainerService = inject(WebContainerService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  prompt = '';
  loading = signal(false);
  currentFiles: any = null; // Track current state
  
  // Project state
  projectId: string | null = null;
  projectName = '';
  
  // App settings (retrieved from profile)
  appSettings: any = null;

  // Selection state
  isSelecting = false;
  selectionRect: { x: number, y: number, width: number, height: number } | null = null;
  startPoint: { x: number, y: number } | null = null;
  attachedImage: string | null = null;
  isDragging = false;
  private isSavingWithThumbnail = false;

  constructor() {
    this.fetchSettings();

    // Handle Route Params
    this.route.params.subscribe(params => {
      this.projectId = params['id'];
      if (this.projectId && this.projectId !== 'new') {
        this.loadProject(this.projectId);
      } else {
        // New project
        this.projectName = this.route.snapshot.queryParams['name'] || 'New Project';
        this.currentFiles = null;
      }
    });

    // Listen for screenshot response
    window.addEventListener('message', (event) => {
      if (event.data.type === 'CAPTURE_RES') {
        if (this.isSavingWithThumbnail) {
          this.executeSave(event.data.image);
          this.isSavingWithThumbnail = false;
        } else {
          this.attachedImage = event.data.image;
          this.isSelecting = false;
          this.selectionRect = null;
        }
      }
    });
  }

  fetchSettings() {
    this.apiService.getProfile().subscribe(user => {
      if (user.settings) {
        this.appSettings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
      }
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
    const iframe = document.querySelector('iframe');
    if (!iframe) return;

    const iframeRect = iframe.getBoundingClientRect();
    const relX = rect.x - iframeRect.left;
    const relY = rect.y - iframeRect.top;
    
    iframe.contentWindow?.postMessage({
      type: 'CAPTURE_REQ',
      rect: { x: relX, y: relY, width: rect.width, height: rect.height }
    }, '*');
  }

  // File Upload Handlers
  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.processFile(file);
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      this.processFile(file);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
  }

  private processFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.attachedImage = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  removeAttachment() {
    this.attachedImage = null;
  }

  saveProject() {
    if (!this.projectName || !this.currentFiles) return;
    
    this.loading.set(true);
    
    // Trigger full screenshot for thumbnail
    const iframe = document.querySelector('iframe');
    if (iframe) {
      this.isSavingWithThumbnail = true;
      iframe.contentWindow?.postMessage({
        type: 'CAPTURE_REQ',
        rect: { x: 0, y: 0, width: 1280, height: 800 } // Standard preview size
      }, '*');
    } else {
      this.executeSave();
    }
  }

  private executeSave(thumbnail?: string) {
    this.apiService.saveProject(
      this.projectName, 
      this.currentFiles, 
      (this.projectId && this.projectId !== 'new') ? this.projectId : undefined,
      thumbnail
    ).subscribe({
      next: (project) => {
        alert('Project saved!');
        this.projectId = project.id;
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        alert('Failed to save project');
        this.loading.set(false);
        this.isSavingWithThumbnail = false;
      }
    });
  }

  loadProject(id: string) {
    this.loading.set(true);
    this.apiService.loadProject(id).subscribe({
      next: async (project) => {
        this.projectName = project.name;
        this.currentFiles = project.files;
        
        const projectFiles = this.mergeFiles(BASE_FILES, this.currentFiles);
        
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
        this.router.navigate(['/dashboard']);
      }
    });
  }

  async downloadZip() {
    if (!this.currentFiles) return;
    
    this.loading.set(true);
    try {
      const zip = new JSZip();
      const fullProject = this.mergeFiles(BASE_FILES, this.currentFiles);
      
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
    } finally {
      this.loading.set(false);
    }
  }

  async generate() {
    if (!this.prompt) return;

    this.loading.set(true);
    const previousSrc = this.currentFiles?.['src'];

    this.apiService.generate(this.prompt, previousSrc, {
      provider: this.appSettings?.provider,
      apiKey: this.appSettings?.apiKey,
      model: this.appSettings?.model,
      images: this.attachedImage ? [this.attachedImage] : undefined
    }).subscribe({
      next: async (res) => {
        try {
          this.attachedImage = null;
          let base = BASE_FILES;
          if (this.currentFiles) {
             base = this.mergeFiles(base, this.currentFiles);
          }
          const projectFiles = this.mergeFiles(base, res.files);
          this.currentFiles = projectFiles;

          await this.webContainerService.mount(projectFiles);
          const exitCode = await this.webContainerService.runInstall(); 
          if (exitCode === 0) {
            this.webContainerService.startDevServer();
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

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  private mergeFiles(base: any, generated: any): any {
    const result = { ...base };
    for (const key in generated) {
      if (generated[key].directory && result[key]?.directory) {
        result[key] = {
          directory: this.mergeFiles(result[key].directory, generated[key].directory)
        };
      } else {
        result[key] = generated[key];
      }
    }
    return result;
  }
}
