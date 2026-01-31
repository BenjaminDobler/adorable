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
import { FileExplorerComponent, FileAction } from './file-explorer/file-explorer';
import { EditorComponent } from './editor/editor.component';
import { SafeUrlPipe } from './pipes/safe-url.pipe';
import { LayoutService } from './services/layout';
import { ToastService } from './services/toast';
import { ChatComponent } from './chat/chat.component';
import { TerminalComponent } from './terminal/terminal.component';
import { ScreenshotService } from './services/screenshot';
import { FigmaPanelComponent } from './figma/figma-panel.component';
import { FigmaImportPayload } from '@adorable/shared-types';
import { TemplateService } from './services/template';
import { AnnotationOverlayComponent, AnnotationResult } from './annotation-overlay/annotation-overlay';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SafeUrlPipe,
    FileExplorerComponent,
    EditorComponent,
    ChatComponent,
    TerminalComponent,
    FigmaPanelComponent,
    AnnotationOverlayComponent,
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
  private templateService = inject(TemplateService);
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

  activeTab = signal<'chat' | 'terminal' | 'files' | 'figma'>('chat');

  // Pending Figma import (passed to chat component when it renders)
  pendingFigmaImport = signal<FigmaImportPayload | null>(null);

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
  isAnnotating = signal(false);
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

    // Clear selection highlight when properties panel is closed
    effect(() => {
      const data = this.visualEditorData();
      if (!data) {
        // Properties panel closed - clear selection in iframe
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'CLEAR_SELECTION' }, '*');
        }
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
        // Keep inspection mode active - user can toggle it off with the button
      }

      // Handle in-place text editing
      if (event.data.type === 'INLINE_TEXT_EDIT') {
        const payload = event.data.payload;
        const fingerprint = {
          tagName: payload.tagName,
          text: payload.text,
          elementId: payload.elementId,
          componentName: payload.componentName,
          hostTag: payload.hostTag,
          classes: payload.classes,
          id: payload.attributes?.id
        };

        console.log('[AppComponent] INLINE_TEXT_EDIT received:', {
          fingerprint,
          newText: payload.newText,
          filesLoaded: !!this.projectService.files()
        });

        const result = this.templateService.findAndModify(fingerprint, {
          type: 'text',
          value: payload.newText
        });

        console.log('[AppComponent] findAndModify result:', result);

        if (result.success) {
          // Update the file in the store
          this.projectService.fileStore.updateFile(result.path, result.content);
          // Write to container (no reload needed - text already updated in DOM)
          this.webContainerService.writeFile(result.path, result.content);

          if (result.isInsideLoop) {
            this.toastService.show('Text updated (all instances in loop affected)', 'info');
          } else {
            this.toastService.show('Text updated', 'success');
          }
        } else {
          console.error('[AppComponent] In-place edit failed:', result.error);
          this.toastService.show('Failed to update text: ' + result.error, 'error');
        }
      }
    });
  }

  toggleInspection() {
    const isActive = !this.isInspectionActive();
    this.isInspectionActive.set(isActive);

    // Disable annotation mode when enabling inspector
    if (isActive) this.isAnnotating.set(false);

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

  toggleAnnotation() {
    const newState = !this.isAnnotating();
    this.isAnnotating.set(newState);
    // Disable inspector when entering annotation mode
    if (newState && this.isInspectionActive()) {
      this.toggleInspection();
    }
  }

  async onAnnotationDone(result: AnnotationResult) {
    this.isAnnotating.set(false);
    const iframeScreenshot = await this.screenshotService.captureThumbnail();
    if (!iframeScreenshot) {
      this.toastService.show('Failed to capture preview screenshot', 'error');
      return;
    }
    const composited = await this.compositeImages(iframeScreenshot, result.imageDataUrl);
    if (this.chatComponent) {
      this.chatComponent.setAnnotatedImage(composited, result.annotations);
      this.toastService.show('Annotation attached to chat', 'success');
    }
  }

  private compositeImages(base: string, overlay: string): Promise<string> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const baseImg = new Image();
      baseImg.onload = () => {
        canvas.width = baseImg.width;
        canvas.height = baseImg.height;
        ctx.drawImage(baseImg, 0, 0);
        const overlayImg = new Image();
        overlayImg.onload = () => {
          ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        };
        overlayImg.src = overlay;
      };
      baseImg.src = base;
    });
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

  async onFileAction(action: FileAction) {
    switch (action.type) {
      case 'create-file':
        this.projectService.fileStore.createFile(action.path);
        try { await this.webContainerService.writeFile(action.path, ''); } catch {}
        break;
      case 'create-folder':
        this.projectService.fileStore.createFolder(action.path);
        try { await this.webContainerService.mkdir(action.path); } catch {}
        break;
      case 'delete':
        this.projectService.fileStore.deleteFile(action.path);
        try { await this.webContainerService.deleteFile(action.path); } catch {}
        // Clear editor if deleted file was selected
        if (this.selectedFilePath() === action.path) {
          this.selectedFileName.set('');
          this.selectedFilePath.set('');
          this.selectedFileContent.set('');
        }
        break;
      case 'rename':
        if (action.newPath) {
          const content = this.projectService.fileStore.getFileContent(action.path) || '';
          this.projectService.fileStore.renameFile(action.path, action.newPath);
          try {
            await this.webContainerService.writeFile(action.newPath, content);
            await this.webContainerService.deleteFile(action.path);
          } catch {}
          // Update editor if renamed file was selected
          if (this.selectedFilePath() === action.path) {
            const name = action.newPath.split('/').pop() || '';
            this.selectedFileName.set(name);
            this.selectedFilePath.set(action.newPath);
          }
        }
        break;
      case 'upload':
        if (action.content) {
          this.projectService.fileStore.updateFile(action.path, action.content);
          try {
            let writeContent: string | Uint8Array = action.content;
            if (action.content.startsWith('data:')) {
              writeContent = this.projectService.dataURIToUint8Array(action.content);
            }
            await this.webContainerService.writeFile(action.path, writeContent);
          } catch {}
          this.toastService.show(`Uploaded ${action.path.split('/').pop()}`, 'success');
        }
        break;
    }
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

  onFigmaImport(payload: FigmaImportPayload) {
    // Store the payload - chat component will pick it up via input
    this.pendingFigmaImport.set(payload);
    // Switch to chat tab
    this.activeTab.set('chat');
  }

  onFigmaImportsChanged(imports: FigmaImportPayload[]) {
    // Update the project service with new imports
    this.projectService.figmaImports.set(imports);
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
