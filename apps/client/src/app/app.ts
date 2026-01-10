import { Component, inject, signal, Pipe, PipeTransform, effect, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from './services/api';
import { WebContainerService } from './services/web-container';
import { ProjectService, ChatMessage } from './services/project';
import { ActivatedRoute, Router } from '@angular/router';
import { FileExplorerComponent } from './file-explorer/file-explorer';
import { EditorComponent } from './editor/editor.component';
import { TerminalFormatterPipe } from './pipes/terminal-formatter.pipe';
import { LayoutService } from './services/layout';
import { ToastService } from './services/toast';
import { ToastComponent } from './ui/toast/toast.component';
import { BASE_FILES } from './base-project';

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
  imports: [CommonModule, FormsModule, SafeUrlPipe, FileExplorerComponent, EditorComponent, TerminalFormatterPipe],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent implements AfterViewChecked {
  private apiService = inject(ApiService);
  public webContainerService = inject(WebContainerService);
  public projectService = inject(ProjectService);
  public layoutService = inject(LayoutService);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  prompt = '';
  activeTab = signal<'chat' | 'terminal' | 'files'>('chat');
  
  // Use project service signals
  messages = this.projectService.messages;
  loading = this.projectService.loading;
  
  selectedFileContent = signal('');
  selectedFileName = signal('');
  selectedFilePath = signal('');
  
  sidebarWidth = signal(400);
  editorHeight = signal(50);
  isResizingEditor = false;
  isResizingSidebar = false;
  
  isInspectionActive = signal(false);
  visualEditorData = signal<any>(null);
  visualPrompt = '';
  terminalInput = '';
  terminalTab = signal<'server' | 'shell' | 'console'>('server');
  
  isAutoFixEnabled = signal(true); // Default to on
  shouldAddToAssets = signal(true);
  attachedFile: File | null = null;
  attachedImage: string | null = null;
  
  debugLogs = signal<any[]>([]);
  showDebug = signal(false);

  quickStarters = [
    {
      label: 'Cyberpunk SaaS Dashboard ⚡',
      description: 'Analytics with neon cyan/pink, glassmorphism sidebar, and real-time data visualizations.',
      prompt: 'Create a high-fidelity SaaS Analytics Dashboard with a "Cyberpunk" aesthetic. Color palette: Deep void black background, neon cyan (#00f3ff) and hot pink (#ff00ff) data accents. Features: A glassmorphism sidebar with glowing active states, a real-time "Live Traffic" area chart with a gradient fill, and "Server Health" cards using radial progress bars. Typography: JetBrains Mono for data, Inter for UI. Use CSS Grid, translucent card backgrounds with backdrop-filter: blur(10px), and subtle 1px borders.'
    },
    {
      label: 'Luxury E-Commerce 👟',
      description: 'Minimalist product showcase with bold black typography, split layout, and smooth accordion animations.',
      prompt: 'Build a premium e-commerce product page for a limited edition sneaker brand. Design style: "Hypebeast Minimalist". Background: Stark white (#ffffff) with massive, bold black typography (Helvetica Now). Layout: Split screen - left side fixed product details with a sticky "Add to Cart" button (pill shape, black), right side scrollable gallery of large, high-res images. Include a "Details" accordion with smooth animations and a "You might also like" horizontal scroll slider.'
    },
    {
      label: 'Smart Home Hub 🏠',
      description: 'Futuristic control center with warm neumorphic palettes, interactive dial controls, and status badges.',
      prompt: 'Design a futuristic Smart Home Control Hub. Aesthetic: "Soft UI" / Neumorphism influence but flatter. Palette: Warm off-white background, soft rounded shadows, and vivid orange/purple gradients for active states. Components: A "Climate" card with a circular interactive temperature dial, "Lighting" scene buttons that glow when active, and a "Security" feed showing a mock live camera view with a "System Armed" status badge. Use heavy border-radius (24px) and fluid hover states.'
    },
    {
      label: 'Travel Journal 🌍',
      description: 'Editorial magazine layout with immersive full-screen photography, parallax headers, and masonry grids.',
      prompt: 'Create an immersive Travel Journal app. Visual style: "Editorial Magazine". The layout relies on full-screen background photography with overlaying text. Hero section: A parallax scrolling header with a dramatic title "Lost in Tokyo". Content: A masonry grid of photo cards with elegant white captions on hover. Typography: Playfair Display (Serif) for headings to give a premium feel, paired with DM Sans. Use varying aspect ratios for images and generous whitespace.'
    }
  ];

  loadingMessages = [
    'Adorable things take time...', 
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
  
  // App settings (retrieved from profile)
  appSettings: any = null;

  // Selection state
  isSelecting = false;
  selectionRect: { x: number, y: number, width: number, height: number } | null = null;
  startPoint: { x: number, y: number } | null = null;
  isDragging = false;
  private isSavingWithThumbnail = false;

  constructor() {
    this.fetchSettings();

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'd') {
        console.log('Toggling Debug Console');
        e.preventDefault();
        this.showDebug.set(!this.showDebug());
      }
    });

    effect(() => {
      if (this.loading()) {
        this.startMessageRotation();
      } else {
        this.stopMessageRotation();
      }
    });

    effect(() => {
      const error = this.webContainerService.buildError();
      if (error && !this.loading()) {
        if (this.isAutoFixEnabled()) {
          this.autoRepair(error);
        }
      }
    });

    // Handle Route Params
    this.route.params.subscribe(params => {
      const projectId = params['id'];
      if (projectId && projectId !== 'new') {
        this.projectService.loadProject(projectId);
      } else {
        // New project
        this.projectService.projectId.set(null);
        this.projectService.projectName.set(this.route.snapshot.queryParams['name'] || 'New Project');
        this.projectService.currentFiles.set(null);
        this.projectService.allFiles.set(null);
        
        // Reset messages to default
        this.messages.set([
          { role: 'assistant', text: 'Hi! I can help you build an Angular app. Describe what you want to create.', timestamp: new Date() }
        ]);

        // Reset preview to base state
        this.projectService.reloadPreview(null);
      }
    });

    // Listen for screenshot response
    window.addEventListener('message', (event) => {
      if (event.data.type === 'PREVIEW_CONSOLE') {
        this.webContainerService.addConsoleLog({
          level: event.data.level,
          message: event.data.message
        });
      }

      if (event.data.type === 'CAPTURE_RES') {
        if (this.isSavingWithThumbnail) {
          this.projectService.saveProject(event.data.image);
          this.isSavingWithThumbnail = false;
        } else {
          this.attachedImage = event.data.image;
          this.isSelecting = false;
          this.selectionRect = null;
        }
      }
      
      if (event.data.type === 'ELEMENT_SELECTED') {
        this.visualEditorData.set(event.data.payload);
        this.isInspectionActive.set(false); // Turn off inspector
      }
    });
  }

  toggleInspection() {
    const isActive = !this.isInspectionActive();
    this.isInspectionActive.set(isActive);
    
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'TOGGLE_INSPECTOR',
        enabled: isActive
      }, '*');
    }
  }

  closeVisualEditor() {
    this.visualEditorData.set(null);
  }

  useQuickStarter(prompt: string) {
    this.prompt = prompt;
    setTimeout(() => {
        const textarea = document.querySelector('.input-container textarea');
        if (textarea) (textarea as HTMLElement).focus();
    }, 0);
  }

  sendTerminalCommand() {
    if (!this.terminalInput) return;
    this.webContainerService.writeToShell(this.terminalInput + '\n');
    this.terminalInput = '';
  }

  applyVisualChanges(prompt: string) {
    if (!this.visualEditorData()) return;
    
    const data = this.visualEditorData();
    const specificContext = data.componentName 
      ? `This change likely involves ${data.componentName}.` 
      : '';
      
    this.prompt = `Visual Edit Request:
    Target Element: <${data.tagName}> class="${data.classes}"
    Original Text: "${data.text}"
    ${specificContext}
    
    Instruction: ${prompt}`;
    
    this.generate();
    this.closeVisualEditor();
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
  
  startResizing(event: MouseEvent) {
    this.isResizingEditor = true;
    event.preventDefault();
  }

  startSidebarResizing(event: MouseEvent) {
    this.isResizingSidebar = true;
    event.preventDefault();
  }

  onMouseDown(event: MouseEvent) {
    if (this.isSelecting) {
        this.startPoint = { x: event.clientX, y: event.clientY };
        this.selectionRect = { x: event.clientX, y: event.clientY, width: 0, height: 0 };
    }
  }

  onMouseMove(event: MouseEvent) {
    if (this.isResizingSidebar) {
      const newWidth = Math.max(250, Math.min(event.clientX, 800)); // Min 250px, Max 800px
      this.sidebarWidth.set(newWidth);
      return;
    }

    if (this.isResizingEditor) {
      const container = document.querySelector('.preview-area');
      if (container) {
        const rect = container.getBoundingClientRect();
        const relativeY = event.clientY - rect.top;
        const percentage = (relativeY / rect.height) * 100;
        this.editorHeight.set(Math.min(Math.max(percentage, 10), 90));
      }
      return;
    }

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
    if (this.isResizingSidebar) {
      this.isResizingSidebar = false;
      return;
    }
    if (this.isResizingEditor) {
      this.isResizingEditor = false;
      return;
    }

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

  reloadIframe() {
    const iframe = document.querySelector('iframe');
    if (iframe) {
      const currentSrc = iframe.src;
      iframe.src = currentSrc;
    }
  }

  onFileSelect(event: {name: string, path: string, content: string}) {
    this.selectedFileName.set(event.name);
    this.selectedFilePath.set(event.path);
    this.selectedFileContent.set(event.content);
  }

  isImage(filename: string): boolean {
    return /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(filename);
  }

  onUploadFiles(event: any) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        const content = e.target.result;
        const targetPath = `public/${file.name}`;
        this.onFileContentChange(content, targetPath);
        this.toastService.show(`Uploaded ${file.name}`, 'success');
      };
      
      reader.readAsDataURL(file);
    }
  }

  async onFileContentChange(newContent: string, explicitPath?: string) {
    const path = explicitPath || this.selectedFilePath();
    if (path) {
      // Update files in project service
      this.projectService.updateFileInTree(this.projectService.allFiles(), path, newContent, true);
      
      const current = this.projectService.currentFiles() || {};
      this.projectService.updateFileInTree(current, path, newContent, true);
      if (!this.projectService.currentFiles()) {
         this.projectService.currentFiles.set(current);
      }

      // Update WebContainer (live preview)
      try {
        let writeContent: string | Uint8Array = newContent;
        if (typeof newContent === 'string' && newContent.startsWith('data:')) {
           writeContent = this.projectService.dataURIToUint8Array(newContent);
        }
        await this.webContainerService.writeFile(path, writeContent);
      } catch (err) {
        console.error('Failed to write file to WebContainer', err);
      }
    }
  }

  autoRepair(error: string) {
    this.projectService.addSystemMessage('Build error detected. Requesting fix...');
    
    const repairPrompt = `The application failed to build with the following errors. Please investigate and fix the code.
    
    Errors:
    ${error}`;
    
    this.prompt = repairPrompt;
    this.generate();
  }

  manualFix() {
    const error = this.webContainerService.buildError();
    if (error) {
      this.autoRepair(error);
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
    this.attachedFile = file;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.attachedImage = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  removeAttachment() {
    this.attachedImage = null;
    this.attachedFile = null;
  }

  saveProject() {
    if (!this.projectService.projectName() || !this.projectService.currentFiles()) return;
    
    this.loading.set(true);
    
    // Trigger full screenshot for thumbnail
    const iframe = document.querySelector('iframe');
    if (iframe) {
      this.isSavingWithThumbnail = true;
      iframe.contentWindow?.postMessage({
        type: 'CAPTURE_REQ',
        rect: {
          x: 0,
          y: 0,
          width: iframe.clientWidth,
          height: iframe.clientHeight
        }
      }, '*');

      setTimeout(() => {
        if (this.isSavingWithThumbnail) {
          console.warn('Screenshot capture timed out. Saving without thumbnail.');
          this.projectService.saveProject();
          this.isSavingWithThumbnail = false;
        }
      }, 2500);
    } else {
      this.projectService.saveProject();
    }
  }

  async restoreVersion(files: any) {
    console.log('Restoring version with files:', files ? Object.keys(files).length : 'null');
    if (!files || this.loading()) return;
    if (confirm('Are you sure you want to restore this version? Current unsaved changes might be lost.')) {
      this.loading.set(true);
      await this.projectService.reloadPreview(files);
      this.projectService.addSystemMessage('Restored project to previous version.');
      this.toastService.show('Version restored', 'info');
    }
  }

  async downloadZip() {
    await this.projectService.downloadZip();
  }

  async publish() {
    await this.projectService.publish();
  }

  async generate() {
    if (!this.prompt) return;

    // Add user message with snapshot
    this.messages.update(msgs => [...msgs, {
      role: 'user',
      text: this.prompt,
      timestamp: new Date(),
      files: this.projectService.currentFiles() 
    }]);

    let currentPrompt = this.prompt;
    this.prompt = ''; 
    this.loading.set(true);

    if (this.attachedImage && this.shouldAddToAssets() && this.attachedFile) {
      const targetPath = `public/assets/${this.attachedFile.name}`;
      this.onFileContentChange(this.attachedImage, targetPath);
      currentPrompt += `\n\n[System Note: I have automatically uploaded the attached image to "${targetPath}". You can use it in your code like <img src="assets/${this.attachedFile.name}">]`
    }

    // Placeholder for assistant
    const assistantMsgIndex = this.messages().length;
    this.messages.update(msgs => [...msgs, {
      role: 'assistant',
      text: '',
      timestamp: new Date()
    }]);

    const previousFiles = this.projectService.allFiles() || this.projectService.currentFiles() || BASE_FILES;
    
    let fullStreamText = '';
    let hasResult = false;
    const toolInputs: {[key: number]: string} = {};
    const toolPaths: {[key: number]: string} = {};

    // Resolve Settings
    let provider = 'anthropic';
    let apiKey = '';
    let model = '';

    if (this.appSettings) {
      if (this.appSettings.profiles && this.appSettings.activeProfileId) {
         const active = this.appSettings.profiles.find((p: any) => p.id === this.appSettings.activeProfileId);
         if (active) {
            provider = active.provider;
            apiKey = active.apiKey;
            model = active.model;
         }
      } else {
         provider = this.appSettings.provider || provider;
         apiKey = this.appSettings.apiKey || apiKey;
         model = this.appSettings.model || model;
      }
    }

    this.apiService.generateStream(currentPrompt, previousFiles, {
      provider,
      apiKey,
      model,
      images: this.attachedImage ? [this.attachedImage] : undefined
    }).subscribe({
      next: async (event) => {
        if (event.type !== 'tool_delta' && event.type !== 'text') { 
           this.debugLogs.update(logs => [...logs, { ...event, timestamp: new Date() }]);
        }

        if (event.type === 'text') {
          fullStreamText += event.content;
          
          let displayText = '';
          const explMatch = fullStreamText.match(/<explanation>([\s\S]*?)(?:<\/explanation>|$)/);
          if (explMatch) {
            displayText = explMatch[1].trim();
          } else {
             displayText = fullStreamText.trim();
          }

          this.messages.update(msgs => {
            const newMsgs = [...msgs];
            newMsgs[assistantMsgIndex].text = displayText;
            return newMsgs;
          });
        } else if (event.type === 'tool_delta') {
          toolInputs[event.index] = (toolInputs[event.index] || '') + event.delta;
          
          if (!toolPaths[event.index]) {
            const pathMatch = toolInputs[event.index].match(/"path"\s*:\s*"([^"]*)"/);
            if (pathMatch) toolPaths[event.index] = pathMatch[1];
          }

          const paths = Object.values(toolPaths);
          if (paths.length > 0) {
            this.messages.update(msgs => {
              const newMsgs = [...msgs];
              const baseText = newMsgs[assistantMsgIndex].text.split('\n\n**Updating files:**')[0];
              newMsgs[assistantMsgIndex].text = baseText + '\n\n**Updating files:**\n' + paths.map(f => `• ${f}`).join('\n');
              return newMsgs;
            });
          }
        } else if (event.type === 'usage') {
           this.messages.update(msgs => {
             const newMsgs = [...msgs];
             newMsgs[assistantMsgIndex].usage = event.usage;
             return newMsgs;
           });
        } else if (event.type === 'result') {
          hasResult = true;
          try {
            this.attachedImage = null;
            this.attachedFile = null;
            const res = event.content;
            
            let base = BASE_FILES;
            if (this.projectService.currentFiles()) {
               base = this.projectService.mergeFiles(base, this.projectService.currentFiles());
            }
            const projectFiles = this.projectService.mergeFiles(base, res.files);
            
            this.messages.update(msgs => {
              const newMsgs = [...msgs];
              newMsgs[assistantMsgIndex].files = projectFiles;
              if (res.explanation) {
                 // We could reimplement extractFilePaths or move it to ProjectService too
                 // For now, let's just rely on the explanation text being set during streaming
                 // or just use what we have.
                 // Actually, extractFilePaths is useful for the "Updated files" list if not using tool stream
                 // But tools update text dynamically.
                 // Let's keep it simple.
              }
              return newMsgs;
            });

            await this.projectService.reloadPreview(projectFiles);

          } catch (err) {
            console.error('WebContainer error:', err);
            this.projectService.addSystemMessage('An error occurred while building the project.');
            this.loading.set(false);
          }
        } else if (event.type === 'error') {
          this.projectService.addSystemMessage(`Error: ${event.content}`);
          this.loading.set(false);
        }
      },
      error: (err) => {
        console.error('API error:', err);
        this.loading.set(false);
        this.projectService.addSystemMessage('Failed to generate code. Please try again.');
      },
      complete: () => {
        if (!hasResult) {
           this.loading.set(false);
        }
      }
    });
  }

  goBack() {
    this.router.navigate(['/dashboard']);
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