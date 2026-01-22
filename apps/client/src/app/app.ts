import {
  Component,
  inject,
  signal,
  effect,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from './services/api';
import { ContainerEngine } from './services/container-engine';
import { SmartContainerEngine } from './services/smart-container.engine';
import { ProjectService } from './services/project';
import { ActivatedRoute, Router } from '@angular/router';
import { FileExplorerComponent } from './file-explorer/file-explorer';
import { EditorComponent } from './editor/editor.component';
import { TerminalFormatterPipe } from './pipes/terminal-formatter.pipe';
import { SafeUrlPipe } from './pipes/safe-url.pipe';
import { LayoutService } from './services/layout';
import { ToastService } from './services/toast';
import { ChatComponent } from './chat/chat.component';
import { TerminalComponent } from './terminal/terminal.component';
import { ScreenshotService } from './services/screenshot';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SafeUrlPipe,
    FileExplorerComponent,
    EditorComponent,
    TerminalFormatterPipe,
    ChatComponent,
    TerminalComponent,
  ],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent implements AfterViewChecked {
  private apiService = inject(ApiService);
  public webContainerService = inject(ContainerEngine);
  public projectService = inject(ProjectService);
  public layoutService = inject(LayoutService);
  private toastService = inject(ToastService);
  private screenshotService = inject(ScreenshotService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  @ViewChild('previewFrame', {static: false}) set previewFrame(ref: ElementRef<HTMLIFrameElement> | undefined) {
    if (ref?.nativeElement) {
      console.log('[AppComponent] Iframe ViewChild resolved, registering...');
      this.screenshotService.registerIframe(ref.nativeElement);
    }
  }


  @ViewChild(ChatComponent) chatComponent!: ChatComponent;

  activeTab = signal<'chat' | 'terminal' | 'files'>('chat');

  // Signals from project service
  messages = this.projectService.messages;
  loading = this.projectService.loading;
  debugLogs = this.projectService.debugLogs;

  selectedFileContent = signal('');
  selectedFileName = signal('');
  selectedFilePath = signal('');

  sidebarWidth = signal(400);
  editorHeight = signal(50);
  isResizingEditor = false;
  isResizingSidebar = false;

  isInspectionActive = signal(false);
  visualEditorData = signal<any>(null);

  showDebug = signal(false);

  loadingMessages = [
    'Adorable things take time...',
    'Building with love...',
    "Just taking a break listening to Pearl Jam. I'll be right back...",
    "Counting the number of pixels... it's a lot.",
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
  selectionRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;
  startPoint: { x: number; y: number } | null = null;
  isDragging = false;
  private isSavingWithThumbnail = false;

  constructor() {

    this.fetchSettings();

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'd') {
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

    // Handle Route Params
    this.route.params.subscribe((params) => {
      const projectId = params['id'];
      if (projectId && projectId !== 'new') {
        this.projectService.loadProject(projectId);
      } else {
        this.projectService.projectId.set(null);
        this.projectService.projectName.set(
          this.route.snapshot.queryParams['name'] || 'New Project',
        );
        this.projectService.fileStore.setFiles({});
        this.messages.set([
          {
            role: 'assistant',
            text: 'Hi! I can help you build an Angular app. Describe what you want to create.',
            timestamp: new Date(),
          },
        ]);
        this.projectService.reloadPreview(null);
      }
    });

    // Listen for iframe messages
    window.addEventListener('message', (event) => {
      if (event.data.type === 'PREVIEW_CONSOLE') {
        this.webContainerService.addConsoleLog({
          level: event.data.level,
          message: event.data.message,
        });
      }

      if (event.data.type === 'CAPTURE_RES') {
        if (this.isSavingWithThumbnail) {
          this.projectService.saveProject(event.data.image);
          this.isSavingWithThumbnail = false;
        } else if (this.chatComponent && this.isSelecting) {
          this.chatComponent.setImage(event.data.image);
          this.isSelecting = false;
          this.selectionRect = null;
        }
      }

      if (event.data.type === 'ELEMENT_SELECTED') {
        this.visualEditorData.set(event.data.payload);
        this.isInspectionActive.set(false);
      }
    });
  }

  toggleInspection() {
    const isActive = !this.isInspectionActive();
    this.isInspectionActive.set(isActive);

    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        {
          type: 'TOGGLE_INSPECTOR',
          enabled: isActive,
        },
        '*',
      );
    }
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop =
          this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }

  fetchSettings() {
    this.apiService.getProfile().subscribe((user) => {
      if (user.settings) {
        this.appSettings =
          typeof user.settings === 'string'
            ? JSON.parse(user.settings)
            : user.settings;
      }
    });
  }

  startSelection() {
    this.isSelecting = true;
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
      this.selectionRect = {
        x: event.clientX,
        y: event.clientY,
        width: 0,
        height: 0,
      };
    }
  }

  onMouseMove(event: MouseEvent) {
    if (this.isResizingSidebar) {
      const newWidth = Math.max(250, Math.min(event.clientX, 800));
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

    this.captureSelection(this.selectionRect);
    this.startPoint = null;
  }

  captureSelection(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const iframe = document.querySelector('iframe');
    if (!iframe) return;

    const iframeRect = iframe.getBoundingClientRect();
    const relX = rect.x - iframeRect.left;
    const relY = rect.y - iframeRect.top;

    iframe.contentWindow?.postMessage(
      {
        type: 'CAPTURE_REQ',
        rect: { x: relX, y: relY, width: rect.width, height: rect.height },
      },
      '*',
    );
  }

  reloadIframe() {
    const iframe = document.querySelector('iframe');
    if (iframe) {
      const currentSrc = iframe.src;
      iframe.src = currentSrc;
    }
  }

  toggleEngine(event: Event) {
    const select = event.target as HTMLSelectElement;
    if (this.webContainerService instanceof SmartContainerEngine) {
      this.webContainerService.setMode(select.value as 'browser' | 'local');
      // Re-trigger preview in new engine
      this.projectService.reloadPreview(this.projectService.files());
    }
  }

  onFileSelect(event: { name: string; path: string; content: string }) {
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
      // Update store
      this.projectService.fileStore.updateFile(path, newContent);

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
