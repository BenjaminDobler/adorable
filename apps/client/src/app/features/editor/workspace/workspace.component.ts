import {
  Component,
  inject,
  signal,
  effect,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  HostListener,
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api';
import { ContainerEngine } from '../../../core/services/container-engine';
import { SmartContainerEngine } from '../../../core/services/smart-container.engine';
import { ProjectService } from '../../../core/services/project';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import {
  FileExplorerComponent,
  FileAction,
} from '../file-explorer/file-explorer';
import { EditorComponent } from '../code-editor/editor.component';
import { SafeUrlPipe } from '../../../shared/pipes/safe-url.pipe';
import { LayoutService } from '../../../core/services/layout';
import { ToastService } from '../../../core/services/toast';
import { ChatComponent } from '../chat/chat.component';
import { TerminalComponent } from '../terminal/terminal.component';
import { ScreenshotService } from '../../../core/services/screenshot';
import { FigmaPanelComponent } from '../figma/figma-panel.component';
import { FigmaImportPayload } from '@adorable/shared-types';
import { TemplateService, ElementFingerprint } from '../services/template';
import {
  AnnotationOverlayComponent,
  AnnotationResult,
} from '../annotation-overlay/annotation-overlay';

import { VersionsPanelComponent } from '../versions/versions-panel.component';
import { InsightsPanelComponent } from '../insights/insights-panel.component';
import { VisualEditorPanelComponent } from '../chat/visual-editor-panel/visual-editor-panel.component';
import { MultiAnnotationPanelComponent, MultiAnnotationItem } from '../chat/multi-annotation-panel/multi-annotation-panel.component';
import { PreviewToolbarComponent, PreviewDimensions } from './preview-toolbar/preview-toolbar.component';
import { DebugOverlayComponent } from './debug-overlay/debug-overlay.component';
import { ProjectSettingsComponent } from '../project-settings/project-settings.component';
import { TranslationsPanelComponent } from '../translations/translations-panel.component';
import { HMRTriggerService } from '../../../core/services/hmr-trigger.service';
import { DevtoolsPanelComponent } from '../devtools/devtools-panel.component';
import { DevtoolsService } from '../../../core/services/devtools.service';
import { ToolsTesterPanelComponent } from '../tools-tester/tools-tester-panel.component';
import { FigmaBridgeService } from '../../../core/services/figma-bridge.service';

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
    VersionsPanelComponent,
    InsightsPanelComponent,
    VisualEditorPanelComponent,
    MultiAnnotationPanelComponent,
    PreviewToolbarComponent,
    DebugOverlayComponent,
    ProjectSettingsComponent,
    TranslationsPanelComponent,
    DevtoolsPanelComponent,
    ToolsTesterPanelComponent,
  ],
  selector: 'app-workspace',
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss',
  schemas: [NO_ERRORS_SCHEMA],
})
export class WorkspaceComponent implements AfterViewChecked {
  private apiService = inject(ApiService);
  public containerEngine = inject(ContainerEngine);
  public projectService = inject(ProjectService);
  public layoutService = inject(LayoutService);
  private toastService = inject(ToastService);
  private screenshotService = inject(ScreenshotService);
  private templateService = inject(TemplateService);
  private hmrTriggerService = inject(HMRTriggerService);
  public devtoolsService = inject(DevtoolsService);
  private figmaBridge = inject(FigmaBridgeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  @ViewChild('previewFrame', { static: false }) set previewFrame(
    ref: ElementRef<HTMLIFrameElement> | undefined,
  ) {
    if (ref?.nativeElement) {
      console.log(
        '[WorkspaceComponent] Iframe ViewChild resolved, registering...',
      );
      this.screenshotService.registerIframe(ref.nativeElement);
    }
  }

  @ViewChild('previewWebview', { static: false }) set previewWebview(
    ref: ElementRef | undefined,
  ) {
    const el = ref?.nativeElement;
    if (el && el !== this._webviewElement) {
      this._webviewElement = null; // not ready for .send() until dom-ready
      this.setupWebviewListeners(el);
    } else if (!el) {
      this._webviewElement = null;
    }
  }

  private _webviewElement: any = null;

  @ViewChild(ChatComponent) chatComponent!: ChatComponent;
  @ViewChild(EditorComponent) editorComponent?: EditorComponent;
  @ViewChild(FigmaPanelComponent) figmaPanel?: FigmaPanelComponent;
  @ViewChild(MultiAnnotationPanelComponent) multiAnnotationPanel?: MultiAnnotationPanelComponent;

  activeTab = signal<'chat' | 'terminal' | 'files' | 'figma' | 'versions' | 'insights' | 'translations' | 'devtools' | 'tools' | 'settings'>(
    'chat',
  );

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
  sidebarPopoverOpen = signal(false);
  editorHeight = signal(50);
  editorSplitDirection = signal<'horizontal' | 'vertical'>('horizontal');
  isResizingEditor = false;
  isResizingSidebar = false;

  isInspectionActive = signal(false);
  isMeasureActive = signal(false);
  isAnnotating = signal(false);
  isMultiAnnotating = signal(false);
  visualEditorData = signal<any>(null);
  multiAnnotationItems = signal<MultiAnnotationItem[]>([]);

  // Responsive preview
  previewDevice = signal<'desktop' | 'tablet' | 'phone'>('desktop');
  previewDimensions = signal<PreviewDimensions>({ width: null, height: null, scale: 1 });

  // Project settings dialog
  showProjectSettings = signal(false);

  // Preview undock (desktop only)
  isPreviewUndocked = signal(false);
  isDesktop = signal(!!(window as any).electronAPI?.isDesktop);

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

  constructor() {
    this.fetchSettings();

    // Re-fetch settings when saved from the settings dialog
    window.addEventListener('adorable-settings-saved', () => this.fetchSettings());

    // Track devtools panel visibility for DOM observer
    effect(() => {
      this.devtoolsService.setPanelVisible(this.activeTab() === 'devtools');
    });

    // Reload preview (webview/undocked) on demand from HMRTriggerService
    this.hmrTriggerService.reloadPreview$.subscribe(() => this.reloadIframe());

    // Figma Live Bridge: when nodes change in Figma, invalidate comparison cache
    // and notify the preview to re-compare if those nodes are visible
    effect(() => {
      const changed = this.figmaBridge.changedNodeIds();
      if (changed.length === 0) return;
      for (const nodeId of changed) {
        this.figmaCompareCache.delete(nodeId);
      }
      // Tell preview to re-check comparison for changed nodes
      this.sendToPreview({ type: 'FIGMA_NODES_CHANGED', changedNodeIds: changed });
      this.figmaBridge.changedNodeIds.set([]);
    });

    // Figma compare mode: when nodeAnnotations is enabled, restrict hover/click
    // in the preview to elements with data-figma-node attributes
    effect(() => {
      const enabled = this.figmaBridge.nodeAnnotations() && this.figmaBridge.connected();
      this.sendToPreview({ type: 'TOGGLE_FIGMA_COMPARE', enabled });
    });

    // Send RELOAD_TRANSLATIONS to the preview — runtime scripts try smart reload first,
    // then fall back to window.location.reload() if no translation service is found.
    this.hmrTriggerService.reloadTranslations$.subscribe(({ content }) => {
      console.log('[Workspace] reloadTranslations$ → sendToPreview | webview:', !!this._webviewElement, '| undocked:', this.isPreviewUndocked());
      this.sendToPreview({ type: 'RELOAD_TRANSLATIONS', content });
    });

    // Re-fetch settings when navigating back from profile
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd && event.url === '/dashboard') {
        this.fetchSettings();
      }
    });

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
        if (this.isPreviewUndocked()) {
          const eApi = (window as any).electronAPI;
          eApi?.previewSendCommand({ type: 'clear-selection' });
        } else {
          this.sendToPreview({ type: 'CLEAR_SELECTION' });
        }
      }
    });

    // Handle Route Params
    this.route.params.subscribe(async (params) => {
      const projectId = params['id'];
      if (projectId && projectId !== 'new') {
        console.log('before load project');
        this.projectService.loadProject(projectId);
        console.log('after load project');
      } else {
        // Generate a unique ID immediately so the native agent creates an
        // isolated directory and DiskFileSystem can locate it for run_command.
        this.projectService.projectId.set(crypto.randomUUID());
        this.projectService.isSaved.set(false);
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

        // Handle kitId from query params for new projects
        const kitId = this.route.snapshot.queryParams['kitId'];
        if (kitId) {
          await this.projectService.setKit(kitId);
        } else {
          this.projectService.reloadPreview(null);
        }
      }
    });

    // Listen for preview window state changes from Electron
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.onPreviewStateChanged) {
      electronAPI.onPreviewStateChanged((state: { undocked: boolean }) => {
        this.isPreviewUndocked.set(state.undocked);
      });
      // Sync initial state
      electronAPI.previewGetState?.().then((state: { undocked: boolean }) => {
        if (state) this.isPreviewUndocked.set(state.undocked);
      });
    }

    // Listen for events relayed from the preview shell (inspect, annotation, screenshot)
    if (electronAPI?.onPreviewEvent) {
      electronAPI.onPreviewEvent(async (event: any) => {
        if (event.type === 'element-selected') {
          if (this.activeTab() === 'devtools') {
            const ongId = event.payload?.ongAnnotation?.id || event.payload?.elementId?.replace('_ong:', '');
            if (ongId) {
              this.devtoolsService.selectByOngId(ongId);
            }
          } else {
            this.visualEditorData.set(event.payload);
          }
        }
        if (event.type === 'inline-text-edit') {
          const payload = event.payload;
          const fingerprint = {
            tagName: payload.tagName,
            text: payload.text,
            elementId: payload.elementId,
            ongAnnotation: payload.ongAnnotation,
            componentName: payload.componentName,
            hostTag: payload.hostTag,
            classes: payload.classes,
            id: payload.attributes?.id,
          };
          const result = await this.templateService.findAndModify(fingerprint, {
            type: 'text',
            value: payload.newText,
          });
          if (result.success) {
            this.projectService.fileStore.updateFile(result.path, result.content);
            this.containerEngine.writeFile(result.path, result.content);
            this.toastService.show(result.isInsideLoop ? 'Text updated (all instances in loop affected)' : 'Text updated', result.isInsideLoop ? 'info' : 'success');
          }
        }
        if (event.type === 'screenshot-captured' && event.image) {
          if (this.chatComponent) {
            this.chatComponent.setImage(event.image);
            this.toastService.show('Screenshot captured', 'success');
          }
        }
        if (event.type === 'annotation-done' && event.image) {
          if (this.chatComponent) {
            this.chatComponent.setAnnotatedImage(event.image, event.annotations || {});
            this.toastService.show('Annotation attached to chat', 'success');
          }
        }
        if (event.type === 'preview-console') {
          this.containerEngine.addConsoleLog({
            level: event.level,
            message: event.message,
          });
        }
      });
    }

    // When the container engine URL changes while undocked, navigate the preview window
    effect(() => {
      const url = this.containerEngine.url();
      if (url && this.isPreviewUndocked() && electronAPI?.previewNavigate) {
        electronAPI.previewNavigate(url);
      }
    });

    // Listen for iframe messages (cloud/non-desktop mode)
    window.addEventListener('message', (event) => {
      if (event.data.type === 'PREVIEW_CONSOLE') {
        this.containerEngine.addConsoleLog({
          level: event.data.level,
          message: event.data.message,
        });
      }

      this.handlePreviewMessage(event.data);
    });
  }

  /**
   * Sets up event listeners on the <webview> element to handle IPC messages
   * from the preview (forwarded by webview-preload.ts).
   */
  private setupWebviewListeners(webview: any) {
    // Mark the webview as ready for executeJavaScript once the guest page has loaded,
    // and inject a message bridge that forwards runtime script messages to the host
    // via console.debug (captured by the console-message event below).
    webview.addEventListener('dom-ready', () => {
      console.log('[WorkspaceComponent] Webview dom-ready');
      this._webviewElement = webview;

      // Notify devtools that the preview reloaded (route config may have changed)
      this.devtoolsService.onPreviewReloaded();

      // Inject a listener that forwards page messages to the host via console.debug.
      // Runtime scripts call window.parent.postMessage(data, '*'). In a webview,
      // window.parent === window, so this dispatches a message event on the same window.
      // We catch it here and forward via console.debug with a prefix.
      webview.executeJavaScript(`
        (function() {
          var _dbg = console.debug.bind(console);
          window.addEventListener('message', function(event) {
            if (event.data && event.data.type && !event.data.__fromHost) {
              _dbg('__ADORABLE_IPC__' + JSON.stringify(event.data));
            }
          });
        })();
      `).catch(() => {});
    });

    // Capture console output from the webview.
    // Also handles __ADORABLE_IPC__ messages for guest→host communication.
    webview.addEventListener('console-message', (event: any) => {
      const msg: string = event.message;

      // Handle guest→host IPC messages (forwarded by injected bridge)
      if (msg.startsWith('__ADORABLE_IPC__')) {
        try {
          const data = JSON.parse(msg.slice('__ADORABLE_IPC__'.length));
          this.handlePreviewMessage(data);
        } catch {}
        return;
      }

      // Forward regular console output to the debug panel
      const levelMap: Record<number, 'log' | 'warn' | 'error'> = { 1: 'log', 2: 'warn', 3: 'error' };
      const level = levelMap[event.level];
      if (level) {
        this.containerEngine.addConsoleLog({ level, message: msg });
      }
    });
  }

  /** Handles a message from the preview (either via webview bridge or iframe postMessage). */
  private async handlePreviewMessage(data: any) {
    if (data.type === 'PREVIEW_ROUTE_CHANGE') {
      this.containerEngine.previewRoute.set(data.route || null);
      // Update devtools route inspector in real time
      if (data.route) {
        this.devtoolsService.updateActiveRoute(data.route);
      }
    }

    // Figma design comparison: preview requests specs for a data-figma-node element
    if (data.type === 'FIGMA_COMPARE_REQUEST' && this.figmaBridge.connected()) {
      const { figmaNodeId, domRect, domStyles } = data;
      this.fetchFigmaComparisonData(figmaNodeId, domRect, domStyles);
    }

    // Figma auto-fix: user clicked "Fix with AI" on the comparison overlay
    if (data.type === 'FIGMA_AUTO_FIX_REQUEST') {
      this.handleFigmaAutoFixRequest(data);
    }

    if (data.type === 'ELEMENT_SELECTED') {
      if (this.activeTab() === 'devtools') {
        // Route to devtools service instead of visual editor
        const ongId = data.payload?.ongAnnotation?.id || data.payload?.elementId?.replace('_ong:', '');
        if (ongId) {
          this.devtoolsService.selectByOngId(ongId);
        }
      } else {
        this.visualEditorData.set(data.payload);
      }
    }

    if (data.type === 'MULTI_ELEMENT_ADDED') {
      const p = data.payload;
      const item: MultiAnnotationItem = {
        index: p.index,
        elementId: p.elementId,
        tagName: p.tagName,
        text: p.text,
        classes: p.classes || '',
        componentName: p.componentName,
        ongAnnotation: p.ongAnnotation,
        note: '',
      };
      this.multiAnnotationItems.update(items => [...items, item]);
      // Auto-focus the new item's textarea
      setTimeout(() => {
        this.multiAnnotationPanel?.scrollToAndFocus(p.index);
      }, 100);
    }

    if (data.type === 'MULTI_ANNOTATION_CLICKED') {
      this.multiAnnotationPanel?.scrollToAndFocus(data.index);
    }

    if (data.type === 'INLINE_TEXT_EDIT') {
      const payload = data.payload;
      const fingerprint = {
        tagName: payload.tagName,
        text: payload.text,
        elementId: payload.elementId,
        ongAnnotation: payload.ongAnnotation,
        componentName: payload.componentName,
        hostTag: payload.hostTag,
        classes: payload.classes,
        id: payload.attributes?.id,
      };

      const result = await this.templateService.findAndModify(fingerprint, {
        type: 'text',
        value: payload.newText,
      });

      if (result.success) {
        this.projectService.fileStore.updateFile(result.path, result.content);
        await this.containerEngine.writeFile(result.path, result.content);
        const isTranslation = result.path.endsWith('.json') || result.path.endsWith('.jsonc');
        const msg = isTranslation
          ? `Translation updated in ${result.path.split('/').pop()}`
          : result.isInsideLoop ? 'Text updated (all instances in loop affected)' : 'Text updated';
        this.toastService.show(msg, isTranslation ? 'info' : result.isInsideLoop ? 'info' : 'success');
        if (isTranslation) {
          this.hmrTriggerService.reloadTranslations(result.content);
        }
      } else {
        this.toastService.show('Failed to update text: ' + result.error, 'error');
      }
    }
  }

  /** Send a message to the preview, handling webview, undocked window, and iframe (cloud). */
  private sendToPreview(data: any) {
    if (this._webviewElement) {
      // Docked webview — use executeJavaScript to dispatch directly into the page context.
      const tagged = { ...data, __fromHost: true };
      const js = `window.postMessage(${JSON.stringify(tagged)}, '*')`;
      this._webviewElement.executeJavaScript(js)
        .then(() => console.log('[Workspace] executeJavaScript resolved for', data.type))
        .catch((e: any) => console.error('[Workspace] executeJavaScript FAILED for', data.type, e));
    } else if (this.isPreviewUndocked()) {
      // Undocked preview window — route via Electron IPC.
      const electronAPI = (window as any).electronAPI;
      electronAPI?.previewSendCommand(data);
    } else {
      // Cloud iframe fallback.
      const iframe = document.querySelector('iframe');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(data, '*');
      }
    }
  }

  toggleInspection() {
    const isActive = !this.isInspectionActive();
    this.isInspectionActive.set(isActive);

    // Disable annotation mode when enabling inspector
    if (isActive) this.isAnnotating.set(false);
    // Disable multi-annotator when enabling inspector
    if (isActive && this.isMultiAnnotating()) {
      this.deactivateMultiAnnotation();
    }

    // Close properties panel when inspector is toggled off
    if (!isActive) {
      this.visualEditorData.set(null);
      // Also turn off measure mode since it depends on inspector
      if (this.isMeasureActive()) {
        this.isMeasureActive.set(false);
        this.sendToPreview({ type: 'TOGGLE_MEASURE', enabled: false });
      }
    }

    if (this.isPreviewUndocked()) {
      // Proxy to preview shell window
      const electronAPI = (window as any).electronAPI;
      electronAPI?.previewSendCommand({ type: 'toggle-inspect' });
    } else {
      this.sendToPreview({ type: 'TOGGLE_INSPECTOR', enabled: isActive });
    }
  }

  toggleMeasure() {
    const newState = !this.isMeasureActive();
    this.isMeasureActive.set(newState);

    if (newState) {
      // Measure mode requires inspector to be active for hover/click
      if (!this.isInspectionActive()) {
        this.isInspectionActive.set(true);
        this.sendToPreview({ type: 'TOGGLE_INSPECTOR', enabled: true });
      }
      // Disable annotation modes
      if (this.isAnnotating()) this.isAnnotating.set(false);
      if (this.isMultiAnnotating()) this.deactivateMultiAnnotation();
    }

    this.sendToPreview({ type: 'TOGGLE_MEASURE', enabled: newState });
  }

  toggleAnnotation() {
    const newState = !this.isAnnotating();
    this.isAnnotating.set(newState);
    // Disable inspector when entering annotation mode
    if (newState && this.isInspectionActive()) {
      this.toggleInspection();
    }
    // Disable multi-annotator when entering freehand annotation mode
    if (newState && this.isMultiAnnotating()) {
      this.deactivateMultiAnnotation();
    }

    if (this.isPreviewUndocked()) {
      // Proxy to preview shell window
      const electronAPI = (window as any).electronAPI;
      electronAPI?.previewSendCommand({ type: 'toggle-annotate' });
    }
  }

  toggleMultiAnnotation() {
    const newState = !this.isMultiAnnotating();
    this.isMultiAnnotating.set(newState);

    if (newState) {
      // Disable inspector and freehand annotator
      if (this.isInspectionActive()) {
        this.isInspectionActive.set(false);
        this.sendToPreview({ type: 'TOGGLE_INSPECTOR', enabled: false });
      }
      if (this.isAnnotating()) {
        this.isAnnotating.set(false);
      }
      // Close visual editor panel
      this.visualEditorData.set(null);
    }
    // Just hide/show badges — don't clear items
    this.sendToPreview({ type: 'TOGGLE_MULTI_ANNOTATOR', enabled: newState });
  }

  /** Fetch Figma node specs and send comparison data to the preview. */
  private figmaCompareCache = new Map<string, any>();
  private async fetchFigmaComparisonData(figmaNodeId: string, domRect: any, domStyles: any) {
    // Check cache first
    let figmaNode = this.figmaCompareCache.get(figmaNodeId);
    if (!figmaNode) {
      try {
        figmaNode = await this.figmaBridge.getNodeForComparison(figmaNodeId).toPromise();
        this.figmaCompareCache.set(figmaNodeId, figmaNode);
      } catch (e) {
        console.warn('[Workspace] Failed to fetch Figma node for comparison:', e);
        return;
      }
    }

    // Extract design specs from the Figma node response
    const node = figmaNode?.document || figmaNode?.node || figmaNode;
    if (!node?.absoluteBoundingBox) return;

    const bbox = node.absoluteBoundingBox;
    const figmaSpecs: any = {
      width: Math.round(bbox.width),
      height: Math.round(bbox.height),
      cornerRadius: node.cornerRadius ?? null,
      paddingTop: node.paddingTop ?? null,
      paddingRight: node.paddingRight ?? null,
      paddingBottom: node.paddingBottom ?? null,
      paddingLeft: node.paddingLeft ?? null,
      itemSpacing: node.itemSpacing ?? null, // auto-layout gap
      fills: node.fills ?? [],
      strokes: node.strokes ?? [],
      strokeWeight: node.strokeWeight ?? null,
    };

    this.sendToPreview({
      type: 'FIGMA_COMPARE_RESULT',
      figmaNodeId,
      figmaSpecs,
      domRect,
      domStyles,
    });
  }

  /** Build a precise AI prompt from Figma deviations and send it to the chat. */
  private handleFigmaAutoFixRequest(data: any) {
    const { figmaNodeId, ongAnnotation, elementTag, elementClass, deltas } = data;
    if (!deltas || deltas.length === 0) return;

    const labelMap: Record<string, string> = {
      W: 'width',
      H: 'height',
      pt: 'padding-top',
      pr: 'padding-right',
      pb: 'padding-bottom',
      pl: 'padding-left',
      radius: 'border-radius',
      gap: 'gap',
    };

    const deviationLines = deltas.map((d: any) => {
      const prop = labelMap[d.label] || d.label;
      return `- \`${prop}\`: currently ${d.dom}px, Figma design: ${d.figma}px (delta: ${d.delta > 0 ? '+' : ''}${d.delta}px)`;
    }).join('\n');

    const classInfo = elementClass ? ` (class="${elementClass}")` : '';
    let sourceLocation = '';
    if (ongAnnotation) {
      sourceLocation = `\n\n**Source location:** \`${ongAnnotation.file}\` at line ${ongAnnotation.line}, column ${ongAnnotation.col} (component: \`${ongAnnotation.component}\`)`;
    }

    const prompt = `Update the \`<${elementTag}>\`${classInfo} element to match its Figma design specs.\n\n` +
      `**Figma node:** ${figmaNodeId}\n\n` +
      `**Deviations to fix:**\n${deviationLines}${sourceLocation}\n\n` +
      `Please update the styles so they match the Figma design values exactly.`;

    if (this.chatComponent) {
      this.chatComponent.onAiChangeRequested(prompt);
      this.toastService.show('Sent fix request to AI', 'success');
    }
  }

  /** Hides the multi-annotator UI without clearing annotations. */
  private deactivateMultiAnnotation() {
    this.isMultiAnnotating.set(false);
    this.sendToPreview({ type: 'TOGGLE_MULTI_ANNOTATOR', enabled: false });
  }

  /** Clears all annotations and resets state completely. */
  clearMultiAnnotations() {
    this.multiAnnotationItems.set([]);
    this.sendToPreview({ type: 'MULTI_ANNOTATE_CLEAR' });
  }

  onMultiAnnotateRemove(index: number) {
    this.multiAnnotationItems.update(items => items.filter(i => i.index !== index));
    this.sendToPreview({ type: 'MULTI_ANNOTATE_REMOVE', index });
  }

  onMultiAnnotateNoteChanged(event: { index: number; note: string }) {
    this.sendToPreview({
      type: 'MULTI_ANNOTATE_UPDATE_NOTE',
      index: event.index,
      note: event.note,
      hasNote: !!event.note
    });
  }

  onMultiAnnotateAiChange(prompt: string) {
    this.deactivateMultiAnnotation();
    this.clearMultiAnnotations();
    if (this.chatComponent) {
      this.chatComponent.onAiChangeRequested(prompt);
    }
  }

  onMultiAnnotatePreview(prompt: string) {
    if (this.chatComponent) {
      this.chatComponent.previewAiChange(prompt);
    }
  }

  async onGoToCode(fingerprint: ElementFingerprint) {
    const location = this.templateService.findElementLocation(fingerprint);
    if (!location) {
      this.toastService.show('Could not locate element in source code', 'error');
      return;
    }

    // Switch to Files tab
    this.activeTab.set('files');

    // Open the file in the editor
    const content = await this.projectService.getFileContent(location.path);
    if (content === null) {
      this.toastService.show(`File not found: ${location.path}`, 'error');
      return;
    }

    const fileName = location.path.split('/').pop() || location.path;
    this.selectedFileName.set(fileName);
    this.selectedFilePath.set(location.path);
    this.selectedFileContent.set(content);

    // Wait for the editor to initialize/render, then reveal the location
    setTimeout(() => {
      if (this.editorComponent) {
        this.editorComponent.revealLocation(
          location.startLine,
          location.startColumn,
          location.endLine,
          location.endColumn
        );
      }
    }, 100);
  }

  onVisualEditAiChange(prompt: string) {
    this.visualEditorData.set(null);
    if (this.chatComponent) {
      this.chatComponent.onAiChangeRequested(prompt);
    }
  }

  onSelectBreadcrumb(event: { elementId: string; tagName: string; index: number }) {
    this.sendToPreview({
      type: 'SELECT_ELEMENT',
      elementId: event.elementId,
      tagName: event.tagName,
      index: event.index,
    });
  }

  async onAnnotationDone(result: AnnotationResult) {
    this.isAnnotating.set(false);
    const iframeScreenshot = await this.screenshotService.captureThumbnail();
    if (!iframeScreenshot) {
      this.toastService.show('Failed to capture preview screenshot', 'error');
      return;
    }
    const composited = await this.compositeImages(
      iframeScreenshot,
      result.imageDataUrl,
    );
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
    if (this.isPreviewUndocked()) {
      // Proxy to preview shell window
      const electronAPI = (window as any).electronAPI;
      electronAPI?.previewSendCommand({ type: 'start-screenshot' });
      return;
    }
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
      // Subtract the side-nav width so the resize handle stays under the cursor
      const sidebar = document.querySelector('.sidebar') as HTMLElement;
      const offset = sidebar ? sidebar.getBoundingClientRect().left : 0;
      const newWidth = Math.max(250, Math.min(event.clientX - offset, 800));
      this.sidebarWidth.set(newWidth);
      return;
    }

    if (this.isResizingEditor) {
      const container = document.querySelector('.preview-area');
      if (container) {
        const rect = container.getBoundingClientRect();
        if (this.editorSplitDirection() === 'vertical') {
          const relativeX = event.clientX - rect.left;
          const percentage = (relativeX / rect.width) * 100;
          this.editorHeight.set(Math.min(Math.max(percentage, 10), 90));
        } else {
          const relativeY = event.clientY - rect.top;
          const percentage = (relativeY / rect.height) * 100;
          this.editorHeight.set(Math.min(Math.max(percentage, 10), 90));
        }
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

  async captureSelection(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    // Hide the selection overlay before capturing so it doesn't appear in the screenshot
    this.isSelecting = false;
    this.selectionRect = null;

    // Wait one frame for the DOM to remove the overlay before capturing
    await new Promise(resolve => setTimeout(resolve, 50));

    const image = await this.screenshotService.captureRegion(rect);
    if (image && this.chatComponent) {
      this.chatComponent.setImage(image);
    }
  }

  reloadIframe() {
    if (this.isPreviewUndocked()) {
      // Reload the separate preview window
      const electronAPI = (window as any).electronAPI;
      const url = this.containerEngine.url();
      if (electronAPI?.previewNavigate && url) {
        electronAPI.previewNavigate(url);
      }
      return;
    }
    if (this._webviewElement) {
      this._webviewElement.reload();
    } else {
      const iframe = document.querySelector('iframe');
      if (iframe) {
        const currentSrc = iframe.src;
        iframe.src = currentSrc;
      }
    }
  }

  openWebviewDevTools() {
    if (this._webviewElement?.openDevTools) {
      this._webviewElement.openDevTools();
    }
  }

  async toggleUndock() {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) return;

    if (this.isPreviewUndocked()) {
      await electronAPI.previewDock();
    } else {
      const url = this.containerEngine.url();
      if (!url) return;
      await electronAPI.previewUndock(url);
    }
  }

  toggleEngine(event: Event) {
    const select = event.target as HTMLSelectElement;
    if (this.containerEngine instanceof SmartContainerEngine) {
      this.containerEngine.setMode(select.value as 'local' | 'native');
      // Re-trigger preview in new engine
      this.projectService.reloadPreview(this.projectService.files());
    }
  }

  async onFileSelect(event: { name: string; path: string; content: string }) {
    this.selectedFileName.set(event.name);
    this.selectedFilePath.set(event.path);
    // For external projects, content may be empty (structure-only). Fetch on demand.
    const content = event.content || await this.projectService.getFileContent(event.path) || '';
    this.selectedFileContent.set(content);
  }

  async onFileAction(action: FileAction) {
    switch (action.type) {
      case 'create-file':
        this.projectService.fileStore.createFile(action.path);
        try {
          await this.containerEngine.writeFile(action.path, '');
        } catch {}
        break;
      case 'create-folder':
        this.projectService.fileStore.createFolder(action.path);
        try {
          await this.containerEngine.mkdir(action.path);
        } catch {}
        break;
      case 'delete':
        this.projectService.fileStore.deleteFile(action.path);
        try {
          await this.containerEngine.deleteFile(action.path);
        } catch {}
        // Clear editor if deleted file was selected
        if (this.selectedFilePath() === action.path) {
          this.selectedFileName.set('');
          this.selectedFilePath.set('');
          this.selectedFileContent.set('');
        }
        break;
      case 'rename':
        if (action.newPath) {
          const content =
            await this.projectService.getFileContent(action.path) || '';
          this.projectService.fileStore.renameFile(action.path, action.newPath);
          try {
            await this.containerEngine.writeFile(action.newPath, content);
            await this.containerEngine.deleteFile(action.path);
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
              writeContent = this.projectService.dataURIToUint8Array(
                action.content,
              );
            }
            await this.containerEngine.writeFile(action.path, writeContent);
          } catch {}
          this.toastService.show(
            `Uploaded ${action.path.split('/').pop()}`,
            'success',
          );
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

  private writeDebounceTimer: any = null;

  async onFileContentChange(newContent: string, explicitPath?: string) {
    const path = explicitPath || this.selectedFilePath();
    if (!path) return;

    // Update store immediately so the editor stays responsive
    this.projectService.fileStore.updateFile(path, newContent);

    // Debounce the container write to avoid preview churn while typing
    if (this.writeDebounceTimer) {
      clearTimeout(this.writeDebounceTimer);
    }

    this.writeDebounceTimer = setTimeout(async () => {
      try {
        let writeContent: string | Uint8Array = newContent;
        if (typeof newContent === 'string' && newContent.startsWith('data:')) {
          writeContent = this.projectService.dataURIToUint8Array(newContent);
        }
        await this.containerEngine.writeFile(path, writeContent);
      } catch (err) {
        console.error('Failed to write file to container', err);
      }
    }, 500);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  @HostListener('document:paste', ['$event'])
  onPaste(event: ClipboardEvent) {
    // Don't intercept paste in editable elements (inputs, textareas, contenteditable)
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;

    try {
      const data = JSON.parse(text);
      if (data.__adorable_figma_export && data.selection && data.imageDataUris && data.jsonStructure) {
        event.preventDefault();
        const { __adorable_figma_export, ...payload } = data as { __adorable_figma_export: boolean } & FigmaImportPayload;

        // Switch to figma tab so the panel renders, then store the payload
        this.activeTab.set('figma');

        // Use setTimeout to let the figma panel render before storing
        setTimeout(() => {
          if (this.figmaPanel) {
            this.figmaPanel.storePayload(payload as FigmaImportPayload);
            this.projectService.figmaImports.set(this.figmaPanel.importedPayloads());
          }
        });

        this.toastService.show(`Imported ${payload.selection.length} Figma design(s) from clipboard`, 'success');
      }
    } catch {
      // Not JSON or not a Figma payload — ignore
    }
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
