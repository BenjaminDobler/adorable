import { Component, inject, signal, Pipe, PipeTransform, effect, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from './services/api';
import { WebContainerService } from './services/web-container';
import { BASE_FILES } from './base-project';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ActivatedRoute, Router } from '@angular/router';
import { FileExplorerComponent } from './file-explorer/file-explorer';
import { EditorComponent } from './editor/editor.component';

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

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  files?: any;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, SafeUrlPipe, FileExplorerComponent, EditorComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent implements AfterViewChecked {
  private apiService = inject(ApiService);
  public webContainerService = inject(WebContainerService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  prompt = '';
  loading = signal(false);
  activeTab = signal<'chat' | 'terminal' | 'files'>('chat');
  messages = signal<ChatMessage[]>([
    { role: 'assistant', text: 'Hi! I can help you build an Angular app. Describe what you want to create.', timestamp: new Date() }
  ]);
  
  currentFiles: any = null; // Track current state
  allFiles: any = null; // Track full project state including base files
  
  selectedFileContent = signal('');
  selectedFileName = signal('');
  selectedFilePath = signal('');

  loadingMessages = [
    'Adorable things take time...',
    'Building with love...',
    'Just taking a break listening to Pearl Jam. I\'ll be right back...',
    'Counting the number of pixels... it\'s a lot.',
    'Herding cats into the codebase...',
    'Reticulating splines...',
    'Teaching the AI how to love... and code.',
    'Brewing some digital coffee for the server...',
    'Wait, did I leave the oven on?',
  ];
  currentMessage = signal(this.loadingMessages[0]);
  private messageInterval: any;
  
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

    effect(() => {
      if (this.loading()) {
        this.startMessageRotation();
      } else {
        this.stopMessageRotation();
      }
    });

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

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch(err) { }
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

  onFileSelect(event: {name: string, path: string, content: string}) {
    this.selectedFileName.set(event.name);
    this.selectedFilePath.set(event.path);
    this.selectedFileContent.set(event.content);
  }

  async onFileContentChange(newContent: string) {
    const path = this.selectedFilePath();
    if (path) {
      // Update allFiles (view state)
      this.updateFileInTree(this.allFiles, path, newContent);
      
      // Update currentFiles (save state)
      if (!this.currentFiles) this.currentFiles = {};
      this.updateFileInTree(this.currentFiles, path, newContent, true);

      // Update WebContainer (live preview)
      try {
        await this.webContainerService.writeFile(path, newContent);
      } catch (err) {
        console.error('Failed to write file to WebContainer', err);
      }
    }
  }

  private updateFileInTree(tree: any, path: string, content: string, createIfMissing = false) {
    if (!tree) return;
    const parts = path.split('/');
    let current = tree;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        if (createIfMissing) {
          current[part] = { directory: {} };
        } else {
          return;
        }
      }
      if (!current[part].directory) {
         if (createIfMissing) current[part].directory = {};
         else return;
      }
      current = current[part].directory;
    }
    
    const fileName = parts[parts.length - 1];
    if (createIfMissing || current[fileName]) {
      current[fileName] = { file: { contents: content } };
    }
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
      this.messages(),
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
        
        if (project.messages) {
          console.log('Loaded messages:', project.messages.length);
          this.messages.set(project.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          })));
          // Debug check for files
          const messagesWithFiles = this.messages().filter(m => m.files);
          console.log('Messages with snapshots:', messagesWithFiles.length);
        } else {
          this.messages.set([]); 
        }

        await this.reloadPreview(this.currentFiles);
      },
      error: (err) => {
        console.error(err);
        alert('Failed to load project');
        this.router.navigate(['/dashboard']);
      }
    });
  }

  async restoreVersion(files: any) {
    console.log('Restoring version with files:', files ? Object.keys(files).length : 'null');
    if (!files || this.loading()) return;
    if (confirm('Are you sure you want to restore this version? Current unsaved changes might be lost.')) {
      this.loading.set(true);
      await this.reloadPreview(files);
      this.messages.update(msgs => [...msgs, {
        role: 'system',
        text: 'Restored project to previous version.',
        timestamp: new Date()
      }]);
    }
  }

  private async reloadPreview(files: any) {
    try {
      this.currentFiles = files;
      const projectFiles = this.mergeFiles(BASE_FILES, this.currentFiles);
      this.allFiles = projectFiles;
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

    // Add user message with current state snapshot
    this.messages.update(msgs => [...msgs, {
      role: 'user',
      text: this.prompt,
      timestamp: new Date(),
      files: this.currentFiles // Snapshot before changes
    }]);

    const currentPrompt = this.prompt;
    this.prompt = ''; // Clear input immediately
    this.loading.set(true);

    const previousSrc = this.currentFiles?.['src'];

    this.apiService.generate(currentPrompt, previousSrc, {
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
          
          // Add Assistant response with new state snapshot
          this.messages.update(msgs => [...msgs, {
            role: 'assistant',
            text: res.explanation || 'I have updated the project based on your request.',
            timestamp: new Date(),
            files: projectFiles // Snapshot after changes
          }]);

          await this.reloadPreview(projectFiles);

        } catch (err) {
          console.error('WebContainer error:', err);
          this.messages.update(msgs => [...msgs, {
            role: 'system',
            text: 'An error occurred while building the project.',
            timestamp: new Date()
          }]);
          this.loading.set(false);
        }
      },
      error: (err) => {
        console.error('API error:', err);
        this.loading.set(false);
        this.messages.update(msgs => [...msgs, {
          role: 'system',
          text: 'Failed to generate code. Please try again.',
          timestamp: new Date()
        }]);
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

  private startMessageRotation() {
    this.stopMessageRotation();
    let index = 0;
    this.currentMessage.set(this.loadingMessages[0]);

    this.messageInterval = setInterval(() => {
      index = (index + 1) % this.loadingMessages.length;
      this.currentMessage.set(this.loadingMessages[index]);
    }, 4000);
  }

  private stopMessageRotation() {
    if (this.messageInterval) {
      clearInterval(this.messageInterval);
      this.messageInterval = null;
    }
  }
}
