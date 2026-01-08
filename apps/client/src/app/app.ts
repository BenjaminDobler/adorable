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
import { TerminalFormatterPipe } from './pipes/terminal-formatter.pipe';
import { LayoutService } from './services/layout';
import { ToastService } from './services/toast';
import { ToastComponent } from './ui/toast/toast.component';

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
  imports: [CommonModule, FormsModule, SafeUrlPipe, FileExplorerComponent, EditorComponent, TerminalFormatterPipe],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent implements AfterViewChecked {
  private apiService = inject(ApiService);
  public webContainerService = inject(WebContainerService);
  public layoutService = inject(LayoutService);
  private toastService = inject(ToastService);
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

  quickStarters = [
    { 
      label: 'Cyberpunk SaaS Dashboard ⚡', 
      prompt: 'Create a high-fidelity SaaS Analytics Dashboard with a "Cyberpunk" aesthetic. Color palette: Deep void black background, neon cyan (#00f3ff) and hot pink (#ff00ff) data accents. Features: A glassmorphism sidebar with glowing active states, a real-time "Live Traffic" area chart with a gradient fill, and "Server Health" cards using radial progress bars. Typography: JetBrains Mono for data, Inter for UI. Use CSS Grid, translucent card backgrounds with backdrop-filter: blur(10px), and subtle 1px borders.' 
    },
    { 
      label: 'Luxury E-Commerce 👟', 
      prompt: 'Build a premium e-commerce product page for a limited edition sneaker brand. Design style: "Hypebeast Minimalist". Background: Stark white (#ffffff) with massive, bold black typography (Helvetica Now). Layout: Split screen - left side fixed product details with a sticky "Add to Cart" button (pill shape, black), right side scrollable gallery of large, high-res images. Include a "Details" accordion with smooth animations and a "You might also like" horizontal scroll slider.' 
    },
    { 
      label: 'Smart Home Hub 🏠', 
      prompt: 'Design a futuristic Smart Home Control Hub. Aesthetic: "Soft UI" / Neumorphism influence but flatter. Palette: Warm off-white background, soft rounded shadows, and vivid orange/purple gradients for active states. Components: A "Climate" card with a circular interactive temperature dial, "Lighting" scene buttons that glow when active, and a "Security" feed showing a mock live camera view with a "System Armed" status badge. Use heavy border-radius (24px) and fluid hover states.' 
    },
    { 
      label: 'Travel Journal 🌍', 
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
      this.projectId = params['id'];
      if (this.projectId && this.projectId !== 'new') {
        this.loadProject(this.projectId);
      } else {
        // New project
        this.projectName = this.route.snapshot.queryParams['name'] || 'New Project';
        this.currentFiles = null;
        this.allFiles = null; // Clear view state
        
        // Reset messages to default
        this.messages.set([
          { role: 'assistant', text: 'Hi! I can help you build an Angular app. Describe what you want to create.', timestamp: new Date() }
        ]);

        // Reset preview to base state
        this.reloadPreview(null);
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
          this.executeSave(event.data.image);
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
    // Optional: Auto-submit
    // this.generate();
    
    // Focus the textarea
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
    
    // Construct a targeted prompt
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
    // Check if we clicked the selection tool or just normal interaction?
    // startSelection is triggered by button.
    // onMouseDown is for drawing the box.
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
      // Force reload by re-assigning src (works for cross-origin)
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
        // Upload to public folder which is configured in angular.json assets
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
      // Update allFiles (view state)
      this.updateFileInTree(this.allFiles, path, newContent, true);
      
      // Update currentFiles (save state)
      if (!this.currentFiles) this.currentFiles = {};
      this.updateFileInTree(this.currentFiles, path, newContent, true);

      // Update WebContainer (live preview)
      try {
        let writeContent: string | Uint8Array = newContent;
        if (typeof newContent === 'string' && newContent.startsWith('data:')) {
           writeContent = this.dataURIToUint8Array(newContent);
        }
        await this.webContainerService.writeFile(path, writeContent);
      } catch (err) {
        console.error('Failed to write file to WebContainer', err);
      }
    }
  }

  private dataURIToUint8Array(dataURI: string): Uint8Array {
    const byteString = atob(dataURI.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return ia;
  }

  autoRepair(error: string) {
    this.messages.update(msgs => [...msgs, {
      role: 'system',
      text: 'Build error detected. Requesting fix...',
      timestamp: new Date()
    }]);
    
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
    if (!this.projectName || !this.currentFiles) return;
    
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
        this.toastService.show('Project saved successfully!', 'success');
        this.projectId = project.id;
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.toastService.show('Failed to save project', 'error');
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

        // DEBUG: Check loaded files for corruption
        console.log('Loaded files keys:', Object.keys(this.currentFiles));
        if (this.currentFiles['public'] && this.currentFiles['public'].directory) {
           const dir = this.currentFiles['public'].directory;
           for (const f in dir) {
             if (dir[f].file) {
                const start = dir[f].file.contents.substring(0, 50);
                console.log(`File ${f} starts with:`, start);
             }
           }
        }

        await this.reloadPreview(this.currentFiles);
      },
      error: (err) => {
        console.error(err);
        this.toastService.show('Failed to load project', 'error');
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
      this.toastService.show('Version restored', 'info');
    }
  }

  private async reloadPreview(files: any) {
    try {
      // 1. Stop server to prevent crashes/conflicts
      await this.webContainerService.stopDevServer();
      
      // 2. Clean old src to avoid ghost files
      await this.webContainerService.clean();

      this.currentFiles = files;
      const projectFiles = this.mergeFiles(BASE_FILES, this.currentFiles);
      this.allFiles = projectFiles;
      
      const { tree, binaries } = this.prepareFilesForMount(projectFiles);

      // 3. Mount text files
      await this.webContainerService.mount(tree);
      
      // 3b. Write binary files explicitly (workaround for potential mount binary issues)
      for (const bin of binaries) {
        await this.webContainerService.writeFile(bin.path, bin.content);
      }
      
      // 4. Install (optimized internally)
      const exitCode = await this.webContainerService.runInstall();
      
      // 5. Start server
      if (exitCode === 0) {
        this.webContainerService.startDevServer();
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  private prepareFilesForMount(files: any, prefix = ''): { tree: any, binaries: { path: string, content: Uint8Array }[] } {
    const tree: any = {};
    let binaries: { path: string, content: Uint8Array }[] = [];

    for (const key in files) {
      const fullPath = prefix + key;
      if (files[key].file) {
        let content = files[key].file.contents;
        const isDataUri = typeof content === 'string' && content.trim().startsWith('data:');
        
        if (isDataUri) {
           const binary = this.dataURIToUint8Array(content);
           binaries.push({ path: fullPath, content: binary });
        } else {
           tree[key] = files[key];
        }
      } else if (files[key].directory) {
        const result = this.prepareFilesForMount(files[key].directory, fullPath + '/');
        tree[key] = { directory: result.tree };
        binaries = binaries.concat(result.binaries);
      }
    }
    return { tree, binaries };
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
      this.toastService.show('Project exported', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      this.toastService.show('Failed to export project', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  async publish() {
    if (!this.projectId || this.projectId === 'new') {
      this.toastService.show('Please save the project first', 'info');
      return;
    }

    this.loading.set(true);
    this.messages.update(msgs => [...msgs, {
      role: 'system',
      text: 'Building and publishing your app...',
      timestamp: new Date()
    }]);

    try {
      // 1. Run build with relative base-href
      const exitCode = await this.webContainerService.runBuild(['--base-href', './']);
      if (exitCode !== 0) throw new Error('Build failed');

      // 2. Read dist files
      // Angular build output is usually in dist/app/browser
      const distPath = 'dist/app/browser';
      const files = await this.getFilesRecursively(distPath);

      // 3. Upload to server
      this.apiService.publish(this.projectId, files).subscribe({
        next: (res) => {
          this.messages.update(msgs => [...msgs, {
            role: 'assistant',
            text: `Success! Your app is published at: ${res.url}`,
            timestamp: new Date()
          }]);
          window.open(res.url, '_blank');
          this.toastService.show('Site published successfully!', 'success');
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.toastService.show('Publishing failed', 'error');
          this.loading.set(false);
        }
      });

    } catch (err: any) {
      console.error(err);
      this.messages.update(msgs => [...msgs, {
        role: 'system',
        text: `Publishing error: ${err.message}`,
        timestamp: new Date()
      }]);
      this.toastService.show('Publishing failed', 'error');
      this.loading.set(false);
    }
  }

  async migrateProject() {
    if (!this.currentFiles) return;
    
    this.loading.set(true);
    try {
      // 1. Ensure 'public' directory exists
      if (!this.currentFiles['public']) {
        this.updateFileInTree(this.currentFiles, 'public/.gitkeep', '', true);
      }

      // 2. Update angular.json
      if (this.currentFiles['angular.json']) {
        const content = this.currentFiles['angular.json'].file.contents;
        const config = JSON.parse(content);
        
        // Fix Assets
        const appArchitect = config.projects.app.architect;
        const buildOptions = appArchitect.build.options;
        
        // Ensure assets array has public
        const hasPublic = buildOptions.assets.some((a: any) => typeof a === 'object' && a.input === 'public');
        if (!hasPublic) {
           buildOptions.assets.push({ "glob": "**/*", "input": "public" });
        }

        // Fix Serve Options (Disable HMR)
        const serveOptions = appArchitect.serve.options;
        serveOptions.hmr = false;
        serveOptions.allowedHosts = ["all"];

        // Write back
        const newConfig = JSON.stringify(config, null, 2);
        this.updateFileInTree(this.currentFiles, 'angular.json', newConfig);
        
        // Update allFiles view state too
        this.updateFileInTree(this.allFiles, 'angular.json', newConfig);
      }

      await this.reloadPreview(this.currentFiles);
      this.toastService.show('Project configuration updated', 'success');
    } catch (err) {
      console.error(err);
      this.toastService.show('Migration failed', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  private async getFilesRecursively(dirPath: string): Promise<any> {
    const result = await this.webContainerService.readdir(dirPath, { withFileTypes: true });
    const entries = result as unknown as { name: string; isDirectory: () => boolean }[];
    const files: any = {};

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      if (entry.isDirectory()) {
        files[entry.name] = {
          directory: await this.getFilesRecursively(fullPath)
        };
      } else {
        const isBinary = /\.(png|jpg|jpeg|gif|svg|webp|ico|pdf|eot|ttf|woff|woff2)$/i.test(entry.name);
        console.log(`Publish Check: '${entry.name}' isBinary=${isBinary}`);
        
        if (isBinary) {
          console.log('Publish: Processing binary file', entry.name);
          const binary = await this.webContainerService.readBinaryFile(fullPath);
          files[entry.name] = {
            file: { 
              contents: this.uint8ArrayToBase64(binary),
              encoding: 'base64'
            }
          };
        } else {
          console.log('Publish: Processing text file', entry.name);
          const contents = await this.webContainerService.readFile(fullPath);
          files[entry.name] = {
            file: { contents }
          };
        }
      }
    }
    return files;
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
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

    let currentPrompt = this.prompt;
    this.prompt = ''; // Clear input immediately
    this.loading.set(true);

    // Auto-upload attached image if enabled
    if (this.attachedImage && this.shouldAddToAssets() && this.attachedFile) {
      const targetPath = `public/assets/${this.attachedFile.name}`;
      // Use await to ensure file is in tree before generating?
      // onFileContentChange updates currentFiles immediately.
      // But writeFile to WebContainer is async.
      // generateStream sends currentFiles (via previousSrc).
      // If onFileContentChange updates currentFiles synchronously (it calls updateFileInTree), then we are good.
      // updateFileInTree is synchronous.
      // writeFile is async but that's for the preview. The AI needs the file STRUCTURE in context?
      // Actually AI gets `previousSrc`.
      // `updateFileInTree` updates `this.currentFiles`.
      // So yes, it works.
      
      this.onFileContentChange(this.attachedImage, targetPath);
      currentPrompt += `\n\n[System Note: I have automatically uploaded the attached image to "${targetPath}". You can use it in your code like <img src="assets/${this.attachedFile.name}">]`;
    }

    // Create placeholder for assistant response
    const assistantMsgIndex = this.messages().length;
    this.messages.update(msgs => [...msgs, {
      role: 'assistant',
      text: '',
      timestamp: new Date()
    }]);

    const previousSrc = this.currentFiles?.['src'];
    
    let fullStreamText = '';

    this.apiService.generateStream(currentPrompt, previousSrc, {
      provider: this.appSettings?.provider,
      apiKey: this.appSettings?.apiKey,
      model: this.appSettings?.model,
      images: this.attachedImage ? [this.attachedImage] : undefined
    }).subscribe({
      next: async (event) => {
        if (event.type === 'text') {
          fullStreamText += event.content;
          
          // Parse stream for display
          let displayText = '';
          const explMatch = fullStreamText.match(/<explanation>([\s\S]*?)(?:<\/explanation>|$)/);
          if (explMatch) {
            displayText = explMatch[1].trim();
          } else if (fullStreamText.trim().startsWith('<explanation>')) {
             // Handle case where we are inside the tag but regex failed
             displayText = fullStreamText.replace('<explanation>', '').trim();
          }

          // Extract file paths
          const fileMatches = fullStreamText.matchAll(/<file path="([^"]+)">/g);
          const files = Array.from(fileMatches).map(m => m[1]);
          
          if (files.length > 0) {
            displayText += '\n\n**Updating files:**\n' + files.map(f => `• ${f}`).join('\n');
          }

          // Fallback if no tags found yet (start of stream) but raw text exists
          if (!displayText && !fullStreamText.includes('<file')) {
             displayText = fullStreamText.replace('<explanation>', '');
          }

          this.messages.update(msgs => {
            const newMsgs = [...msgs];
            newMsgs[assistantMsgIndex].text = displayText;
            return newMsgs;
          });
        } else if (event.type === 'result') {
          try {
            this.attachedImage = null;
            const res = event.content;
            
            let base = BASE_FILES;
            if (this.currentFiles) {
               base = this.mergeFiles(base, this.currentFiles);
            }
            const projectFiles = this.mergeFiles(base, res.files);
            
            // Update message with final files snapshot and clean explanation
            this.messages.update(msgs => {
              const newMsgs = [...msgs];
              newMsgs[assistantMsgIndex].files = projectFiles;
              if (res.explanation) {
                 // Keep the nice file list or just the explanation? 
                 // User wants explanation. The file list is implicit in the result.
                 // Let's just show explanation + file list as summary.
                 const filePaths = this.extractFilePaths(res.files);
                 newMsgs[assistantMsgIndex].text = res.explanation + '\n\n**Updated files:**\n' + filePaths.map(f => `• ${f}`).join('\n');
              }
              return newMsgs;
            });

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
        } else if (event.type === 'error') {
          this.messages.update(msgs => [...msgs, {
            role: 'system',
            text: `Error: ${event.content}`,
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
      },
      complete: () => {
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

  private extractFilePaths(files: any, prefix = ''): string[] {
    let paths: string[] = [];
    for (const key in files) {
      if (files[key].file) {
        paths.push(prefix + key);
      } else if (files[key].directory) {
        paths = paths.concat(this.extractFilePaths(files[key].directory, prefix + key + '/'));
      }
    }
    return paths;
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
