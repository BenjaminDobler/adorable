import { Component, inject, signal, ElementRef, ViewChild, Output, EventEmitter, Input, effect, computed, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Subscription, takeUntil, Subject } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService, ChatMessage, Question } from '../services/project';
import { ContainerEngine } from '../services/container-engine';
import { ApiService } from '../services/api';
import { ToastService } from '../services/toast';
import { ConfirmService } from '../services/confirm';
import { SkillsService, Skill } from '../services/skills';
import { HMRTriggerService } from '../services/hmr-trigger.service';
import { ProgressiveEditorStore } from '../services/progressive-editor.store';
import { ScreenshotService } from '../services/screenshot';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { BASE_FILES } from '../base-project';
import { FigmaImportPayload } from '@adorable/shared-types';

// Sub-components
import { VisualEditorPanelComponent } from './visual-editor-panel/visual-editor-panel.component';
import { ChatMessageListComponent } from './chat-message-list/chat-message-list.component';
import { ChatInputComponent } from './chat-input/chat-input.component';
import { AiSettingsPopoverComponent } from './ai-settings-popover/ai-settings-popover.component';
import { McpToolsPanelComponent } from './mcp-tools-panel/mcp-tools-panel.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SafeUrlPipe,
    VisualEditorPanelComponent,
    ChatMessageListComponent,
    ChatInputComponent,
    AiSettingsPopoverComponent,
    McpToolsPanelComponent
  ],
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss']
})
export class ChatComponent implements OnDestroy {
  private activeSubscription: Subscription | null = null;
  private destroy$ = new Subject<void>();
  private apiService = inject(ApiService);
  public webContainerService = inject(ContainerEngine);
  public projectService = inject(ProjectService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private skillsService = inject(SkillsService);
  private hmrTrigger = inject(HMRTriggerService);
  private progressiveStore = inject(ProgressiveEditorStore);
  private screenshotService = inject(ScreenshotService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('messageList') private messageList!: ChatMessageListComponent;
  @ViewChild('chatInput') private chatInput!: ChatInputComponent;

  // App settings (retrieved from profile)
  private _appSettings: any = null;
  @Input() set appSettings(value: any) {
    this._appSettings = value;
    if (value) {
      this.loadAvailableModels();
    }
  }
  get appSettings() { return this._appSettings; }

  @Input() visualEditorData = signal<any>(null);

  // Pending Figma import from the Figma panel
  @Input() set pendingFigmaImport(payload: FigmaImportPayload | null) {
    if (payload) {
      this.handleFigmaImport(payload);
      this.figmaImportProcessed.emit();
    }
  }

  @Output() startSelection = new EventEmitter<void>();
  @Output() fileUploaded = new EventEmitter<{name: string, content: string}>();
  @Output() closeVisualEdit = new EventEmitter<void>();
  @Output() figmaImportProcessed = new EventEmitter<void>();
  @Output() popoverToggled = new EventEmitter<boolean>();

  messages = this.projectService.messages;
  loading = this.projectService.loading;

  prompt = '';

  // UI State
  compactMode = signal(true);
  shouldAddToAssets = signal(true);
  attachedFile: File | null = null;
  attachedFileContent: string | null = null;
  annotationContext: string | null = null;
  previewImageUrl = signal<string | null>(null);

  availableModels = signal<any[]>([]);
  selectedModel = signal(this.availableModels()[0]);

  availableSkills = signal<Skill[]>([]);
  selectedSkill = signal<Skill | null>(null);

  // MCP Tools
  mcpToolsVisible = signal(false);
  mcpToolsLoading = signal(false);
  mcpServers = signal<{ id: string; name: string; url: string; enabled: boolean }[]>([]);
  mcpTools = signal<{ name: string; originalName: string; description: string; serverId: string }[]>([]);

  // Component Kits
  availableKits = signal<{ id: string; name: string; npmPackage?: string }[]>([]);

  // Figma import state
  figmaContext = signal<any>(null);
  figmaImages = signal<string[]>([]);

  // AI settings popover
  aiSettingsOpen = signal(false);
  aiSettingsPosition = signal<{ bottom: number; left: number }>({ bottom: 0, left: 0 });

  // Reasoning effort
  reasoningEffort = signal<'low' | 'medium' | 'high'>('high');

  // Plan Mode
  planMode = signal(false);

  get isAttachedImage(): boolean {
    if (this.attachedFile?.type.startsWith('image/')) return true;
    if (this.attachedFileContent?.startsWith('data:image/')) return true;
    return false;
  }

  get hasFigmaAttachment(): boolean {
    return this.figmaImages().length > 0;
  }

  get figmaFrameCount(): number {
    return this.figmaImages().length;
  }

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

  constructor() {
    this.loadSkills();
    this.loadKits();

    // Cancel any active generation when the project is being switched
    this.projectService.projectSwitching$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      if (this.activeSubscription) {
        console.log('[ChatComponent] Cancelling active generation due to project switch');
        this.activeSubscription.unsubscribe();
        this.activeSubscription = null;
        this.loading.set(false);
        this.progressiveStore.markAllComplete();
      }
    });

    effect(() => {
        // Auto-scroll when messages change, but only if user is at bottom
        this.messages();
        setTimeout(() => {
          this.messageList?.checkAutoScroll();
        }, 0);
    });

    // Agent mode is always enabled (Docker/Native only)
    effect(() => {
       const mode = this.webContainerService.mode();
       this.projectService.agentMode.set(mode === 'local' || mode === 'native');
    });
  }

  // ===== AI Settings =====

  toggleAiSettings(event: MouseEvent) {
    if (this.aiSettingsOpen()) {
      this.aiSettingsOpen.set(false);
      this.popoverToggled.emit(false);
      return;
    }
    const btn = (event.currentTarget as HTMLElement);
    const rect = btn.getBoundingClientRect();
    this.aiSettingsPosition.set({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left
    });
    this.aiSettingsOpen.set(true);
    this.popoverToggled.emit(true);
  }

  closeAiSettings() {
    this.aiSettingsOpen.set(false);
    this.popoverToggled.emit(false);
  }

  // ===== Data Loading =====

  loadSkills() {
    this.skillsService.getSkills().subscribe({
      next: (skills) => this.availableSkills.set(skills),
      error: () => console.warn('Failed to load skills for chat')
    });
  }

  loadKits() {
    this.apiService.listKits().subscribe({
      next: (result) => this.availableKits.set(result.kits || []),
      error: () => console.warn('Failed to load kits for chat')
    });
  }

  loadMcpTools() {
    this.mcpToolsLoading.set(true);
    this.apiService.getAvailableMcpTools().subscribe({
      next: (result) => {
        this.mcpServers.set(result.servers);
        this.mcpTools.set(result.tools);
        this.mcpToolsLoading.set(false);
      },
      error: (err) => {
        console.warn('Failed to load MCP tools:', err);
        this.mcpToolsLoading.set(false);
      }
    });
  }

  toggleMcpTools() {
    if (!this.mcpToolsVisible()) {
      this.loadMcpTools();
    }
    this.mcpToolsVisible.set(!this.mcpToolsVisible());
  }

  loadAvailableModels() {
    if (!this.appSettings) return;

    let profiles = this.appSettings.profiles;

    // Handle Legacy
    if (!profiles && this.appSettings.provider) {
        profiles = [{
            id: 'legacy',
            name: this.appSettings.provider,
            provider: this.appSettings.provider,
            apiKey: this.appSettings.apiKey,
            model: this.appSettings.model
        }];
    }

    if (!profiles || profiles.length === 0) return;

    profiles.forEach((profile: any) => {
       if (profile.provider === 'figma') return;

       if (profile.apiKey) {
          let providerParam = profile.provider;
          if (providerParam === 'gemini') providerParam = 'google';

          this.apiService.getModels(providerParam, profile.apiKey).subscribe({
             next: (fetched) => {
                const newModels = fetched.map((m: string) => ({
                   id: m,
                   name: `${profile.name.split(' ')[0]} - ${m}`,
                   provider: profile.provider
                }));

                this.availableModels.update(current => {
                   const existingIds = new Set(current.map(c => c.id));
                   const toAdd = newModels.filter((n: any) => !existingIds.has(n.id));
                   return [...current, ...toAdd];
                });
                if (!this.selectedModel() && this.availableModels().length > 0) {
                   const activeProfile = this.appSettings?.profiles?.find((p: any) => p.id === this.appSettings.activeProfileId);
                   const preferred = activeProfile ? this.availableModels().find((m: any) => m.id === activeProfile.model) : null;
                   this.selectedModel.set(preferred || this.availableModels()[0]);
                }
             },
             error: (err) => console.error(`Failed to fetch models for chat dropdown (${profile.provider})`, err)
          });
       }
    });
  }

  // ===== Public API (called by parent via ViewChild) =====

  setImage(image: string) {
    this.attachedFileContent = image;
    this.annotationContext = null;
    this.cdr.markForCheck();
  }

  setAnnotatedImage(image: string, annotations: { texts: string[]; hasArrows: boolean; hasRectangles: boolean; hasFreehand: boolean }) {
    this.attachedFileContent = image;

    const parts: string[] = [];
    const markTypes: string[] = [];
    if (annotations.hasArrows) markTypes.push('arrows pointing to elements');
    if (annotations.hasRectangles) markTypes.push('rectangles highlighting areas');
    if (annotations.hasFreehand) markTypes.push('freehand marks');

    if (markTypes.length > 0) {
      parts.push(`The user drew ${markTypes.join(', ')} on the screenshot.`);
    }
    if (annotations.texts.length > 0) {
      parts.push(`Text labels on the screenshot: ${annotations.texts.map(t => `"${t}"`).join(', ')}.`);
    }

    this.annotationContext = parts.length > 0 ? parts.join(' ') : null;
    this.cdr.markForCheck();
  }

  // ===== Quick Starters =====

  useQuickStarter(prompt: string) {
    this.prompt = prompt;
    this.chatInput?.focusAndResize();
  }

  // ===== Visual Editor =====

  closeVisualEditor() {
    this.closeVisualEdit.emit();
  }

  onAiChangeRequested(prompt: string) {
    this.prompt = prompt;
    this.generate();
    this.closeVisualEditor();
  }

  // ===== File Upload Handlers =====

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.processFile(file);
    }
  }

  private processFile(file: File) {
    this.attachedFile = file;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.attachedFileContent = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  removeAttachment() {
    this.attachedFileContent = null;
    this.attachedFile = null;
    this.annotationContext = null;
  }

  removeFigmaAttachment() {
    this.figmaContext.set(null);
    this.figmaImages.set([]);
  }

  // ===== Build Error =====

  autoRepair(error: string) {
    this.projectService.addSystemMessage('Build error detected. Requesting fix...');

    const repairPrompt = `The application failed to build with the following errors. Please investigate and fix the code.

    Errors:
    ${error}`;

    this.prompt = repairPrompt;
    this.generate();
  }

  // ===== Version Restore =====

  async restoreVersion(filesOrSha: any) {
    if (!filesOrSha || this.loading()) return;
    const confirmed = await this.confirmService.confirm(
      'Are you sure you want to restore this version? Current unsaved changes might be lost.',
      'Restore',
      'Cancel'
    );
    if (!confirmed) return;

    this.loading.set(true);

    if (typeof filesOrSha === 'string') {
      const projectId = this.projectService.projectId();
      if (!projectId) {
        this.toastService.show('No project to restore', 'error');
        this.loading.set(false);
        return;
      }
      try {
        const result = await this.apiService.restoreVersion(projectId, filesOrSha).toPromise();
        if (result?.files) {
          await this.projectService.reloadPreview(result.files);
          this.projectService.addSystemMessage('Restored project to previous version.');
          this.toastService.show('Version restored', 'info');
        }
      } catch (err) {
        console.error('Restore failed:', err);
        this.toastService.show('Failed to restore version', 'error');
        this.loading.set(false);
      }
    } else {
      await this.projectService.reloadPreview(filesOrSha);
      this.projectService.addSystemMessage('Restored project to previous version.');
      this.toastService.show('Version restored', 'info');
    }
  }

  // ===== Question Handlers =====

  submitQuestionAnswers(msg: ChatMessage) {
    if (!msg.pendingQuestion) return;

    const { requestId, answers } = msg.pendingQuestion;

    this.apiService.submitQuestionAnswers(requestId, answers).subscribe({
      next: (result) => {
        console.log('[Question] Answers submitted:', result);
        this.messages.update(msgs => {
          const newMsgs = [...msgs];
          const msgIndex = newMsgs.indexOf(msg);
          if (msgIndex >= 0) {
            newMsgs[msgIndex] = { ...msg, pendingQuestion: undefined, status: 'Processing your answers...' };
          }
          return newMsgs;
        });
      },
      error: (err) => {
        console.error('[Question] Error submitting answers:', err);
        this.toastService.show('Failed to submit answers', 'error');
      }
    });
  }

  cancelQuestion(msg: ChatMessage) {
    if (!msg.pendingQuestion) return;

    const { requestId } = msg.pendingQuestion;

    this.apiService.cancelQuestion(requestId).subscribe({
      next: (result) => {
        console.log('[Question] Request cancelled:', result);
        this.messages.update(msgs => {
          const newMsgs = [...msgs];
          const msgIndex = newMsgs.indexOf(msg);
          if (msgIndex >= 0) {
            newMsgs[msgIndex] = { ...msg, pendingQuestion: undefined, status: undefined };
            newMsgs[msgIndex].text = (newMsgs[msgIndex].text || '') + '\n\n*[Question request cancelled]*';
          }
          return newMsgs;
        });
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[Question] Error cancelling request:', err);
      }
    });
  }

  updateQuestionAnswer(event: { msg: ChatMessage; questionId: string; value: any }) {
    const { msg, questionId, value } = event;
    if (!msg.pendingQuestion) return;

    this.messages.update(msgs => {
      const newMsgs = [...msgs];
      const msgIndex = newMsgs.indexOf(msg);
      if (msgIndex >= 0 && newMsgs[msgIndex].pendingQuestion) {
        newMsgs[msgIndex].pendingQuestion!.answers[questionId] = value;
      }
      return newMsgs;
    });
  }

  toggleCheckboxOption(event: { msg: ChatMessage; questionId: string; optionValue: string }) {
    const { msg, questionId, optionValue } = event;
    if (!msg.pendingQuestion) return;

    const currentValue = msg.pendingQuestion.answers[questionId] || [];
    const newValue = currentValue.includes(optionValue)
      ? currentValue.filter((v: string) => v !== optionValue)
      : [...currentValue, optionValue];

    this.updateQuestionAnswer({ msg, questionId, value: newValue });
  }

  acceptDefaults(msg: ChatMessage) {
    if (!msg.pendingQuestion) return;

    const defaultAnswers: Record<string, any> = {};
    for (const q of msg.pendingQuestion.questions) {
      if (q.default !== undefined) {
        defaultAnswers[q.id] = q.default;
      }
    }

    this.messages.update(msgs => {
      const newMsgs = [...msgs];
      const msgIndex = newMsgs.indexOf(msg);
      if (msgIndex >= 0 && newMsgs[msgIndex].pendingQuestion) {
        newMsgs[msgIndex].pendingQuestion!.answers = {
          ...newMsgs[msgIndex].pendingQuestion!.answers,
          ...defaultAnswers
        };
      }
      return newMsgs;
    });

    setTimeout(() => {
      this.submitQuestionAnswers(msg);
    }, 50);
  }

  // ===== Project Image Assets =====

  getProjectImageAssets(): { path: string; name: string }[] {
    const files = this.projectService.files();
    if (!files) return [];

    const assets: { path: string; name: string }[] = [];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];

    const traverse = (node: any, currentPath: string) => {
      if (node.file) {
        const ext = currentPath.substring(currentPath.lastIndexOf('.')).toLowerCase();
        if (imageExtensions.includes(ext)) {
          const name = currentPath.split('/').pop() || currentPath;
          assets.push({ path: currentPath, name });
        }
      } else if (node.directory) {
        for (const key in node.directory) {
          traverse(node.directory[key], `${currentPath}${key}/`.replace('//', '/'));
        }
      }
    };

    if (files['public']?.directory?.['assets']?.directory) {
      traverse({ directory: files['public'].directory['assets'].directory }, 'assets/');
    }

    return assets;
  }

  // ===== Figma =====

  private simplifyFigmaContext(context: Record<string, any>): string {
    const summaries: string[] = [];

    for (const nodeId of Object.keys(context)) {
      const node = context[nodeId]?.document;
      if (!node) continue;

      const summary = this.summarizeNode(node, 0);
      summaries.push(summary);
    }

    return summaries.join('\n\n');
  }

  private summarizeNode(node: any, depth: number): string {
    if (depth > 3) return '';

    const indent = '  '.repeat(depth);
    const dims = node.absoluteBoundingBox
      ? ` (${Math.round(node.absoluteBoundingBox.width)}×${Math.round(node.absoluteBoundingBox.height)})`
      : '';

    let line = `${indent}- ${node.name} [${node.type}]${dims}`;

    if (node.children && node.children.length > 0 && depth < 3) {
      const childSummaries = node.children
        .slice(0, 10)
        .map((child: any) => this.summarizeNode(child, depth + 1))
        .filter((s: string) => s);

      if (childSummaries.length > 0) {
        line += '\n' + childSummaries.join('\n');
      }

      if (node.children.length > 10) {
        line += `\n${indent}  ... and ${node.children.length - 10} more children`;
      }
    }

    return line;
  }

  handleFigmaImport(payload: FigmaImportPayload) {
    console.log('[Figma Import] Received payload:', {
      fileName: payload.fileName,
      selectionCount: payload.selection?.length,
      imageCount: payload.imageDataUris?.length,
      hasJsonStructure: !!payload.jsonStructure
    });

    this.figmaImages.set(payload.imageDataUris || []);
    this.figmaContext.set(payload.jsonStructure);

    const frameList = payload.selection.map(s => `- ${s.nodeName} (${s.nodeType})`).join('\n');

    this.prompt = `Create Angular components from this Figma design:

File: ${payload.fileName}
Selected Frames:
${frameList}

Please analyze the design images and structure, then create the corresponding Angular components with accurate styling.`;

    this.chatInput?.focusAndResize();
  }

  // ===== Context Files for Visual Edit =====

  getContextFiles(): { [path: string]: string } | undefined {
    const data = this.visualEditorData();
    if (!data || !data.componentName) return undefined;

    const files = this.projectService.files();
    if (!files) return undefined;

    const componentName = data.componentName;
    let baseName = componentName.replace(/Component$/, '');
    baseName = baseName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

    const contextFiles: { [path: string]: string } = {};

    const traverse = (node: any, currentPath: string) => {
      if (node.file) {
        if (currentPath.toLowerCase().includes(`${baseName}.component`)) {
           contextFiles[currentPath] = node.file.contents;
        }
      } else if (node.directory) {
        for (const key in node.directory) {
           traverse(node.directory[key], `${currentPath}${key}/`);
        }
      }
    };

    traverse(files, '');
    return Object.keys(contextFiles).length > 0 ? contextFiles : undefined;
  }

  // ===== Generation =====

  async generate() {
    if (!this.prompt) return;

    this.messages.update(msgs => [...msgs, {
      role: 'user',
      text: this.prompt,
      timestamp: new Date(),
      files: this.projectService.files()
    }]);

    let currentPrompt = this.prompt;
    this.prompt = '';
    this.chatInput?.resetTextareaHeight();
    this.loading.set(true);
    const generationStartTime = Date.now();

    if (this.attachedFileContent && this.attachedFile) {
      this.fileUploaded.emit({name: this.attachedFile.name, content: this.attachedFileContent});

      if (this.shouldAddToAssets() && this.isAttachedImage) {
        const targetPath = `public/assets/${this.attachedFile.name}`;
        currentPrompt += `

[System Note: I have automatically uploaded the attached image to "${targetPath}". You can use it in your code like <img src="assets/${this.attachedFile.name}">]`;
      } else {
         currentPrompt += `

[System Note: The user has attached a file named "${this.attachedFile.name}". It is available in the input context.]`;
      }
    }

    if (this.figmaContext()) {
      const simplifiedContext = this.simplifyFigmaContext(this.figmaContext());
      currentPrompt += `

--- Figma Design Context ---
<figma_summary>
${simplifiedContext}
</figma_summary>

Analyze the attached design images carefully and create matching Angular components. The summary above provides structural hints.`;
    }

    if (this.annotationContext) {
      currentPrompt += `

[Annotated Screenshot: The attached image is a screenshot of the user's live app with visual annotations drawn on top. The colored marks (arrows, rectangles, freehand strokes, text labels) are the user's annotations — NOT part of the actual app UI. ${this.annotationContext} Interpret these annotations as instructions for what the user wants changed in the code.]`;
      this.annotationContext = null;
    }

    const assistantMsgIndex = this.messages().length;
    this.messages.update(msgs => [...msgs, {
      role: 'assistant',
      text: '',
      timestamp: new Date(),
      updatedFiles: []
    }]);

    const previousFiles = this.projectService.files() || BASE_FILES;

    let fullStreamText = '';
    let hasResult = false;
    const toolInputs: {[key: number]: string} = {};
    const toolPaths: {[key: number]: string} = {};

    let provider = 'anthropic';
    let apiKey = '';
    let model = '';
    let builtInTools: { webSearch?: boolean, urlContext?: boolean } | undefined;

    if (this.appSettings) {
      if (this.appSettings.profiles && this.appSettings.activeProfileId) {
         const active = this.appSettings.profiles.find((p: any) => p.id === this.appSettings.activeProfileId);
         if (active) {
            provider = active.provider;
            apiKey = active.apiKey;
            model = active.model;
            builtInTools = active.builtInTools;
         }
      } else {
         provider = this.appSettings.provider || provider;
         apiKey = this.appSettings.apiKey || apiKey;
         model = this.appSettings.model || model;
      }
    }

    const currentSelection = this.selectedModel();
    if (currentSelection && currentSelection.id) {
        provider = currentSelection.provider;
        model = currentSelection.id;
        if (this.appSettings?.profiles) {
           const profileForProvider = this.appSettings.profiles.find((p: any) => p.provider === provider);
           if (profileForProvider) {
               apiKey = profileForProvider.apiKey;
               builtInTools = profileForProvider.builtInTools;
           }
        }
    }

    const allImages: string[] = [];
    if (this.attachedFileContent) {
      allImages.push(this.attachedFileContent);
    }
    if (this.figmaImages().length > 0) {
      allImages.push(...this.figmaImages());
    }

    console.log('[Generate] Sending request with:', {
      promptLength: currentPrompt.length,
      imageCount: allImages.length,
      hasFigmaContext: !!this.figmaContext()
    });

    this.activeSubscription = this.apiService.generateStream(currentPrompt, previousFiles, {
      provider,
      apiKey,
      model,
      images: allImages.length > 0 ? allImages : undefined,
      openFiles: this.getContextFiles(),
      use_container_context: this.projectService.agentMode(),
      forcedSkill: this.selectedSkill()?.name,
      planMode: this.planMode(),
      kitId: this.projectService.selectedKitId() || undefined,
      projectId: this.projectService.projectId() || undefined,
      builtInTools,
      reasoningEffort: this.reasoningEffort()
    }).subscribe({
      next: async (event) => {
        if (event.type !== 'tool_delta' && event.type !== 'text') {
           this.projectService.debugLogs.update(logs => [...logs, { ...event, timestamp: new Date() }]);
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
            newMsgs[assistantMsgIndex].status = 'Generating...';
            return newMsgs;
          });
        } else if (event.type === 'tool_delta') {
          toolInputs[event.index] = (toolInputs[event.index] || '') + event.delta;

          let currentPath = toolPaths[event.index];
          if (!currentPath) {
            const pathMatch = toolInputs[event.index].match(/"path"\s*:\s*"([^"]*)"/);
            if (pathMatch) {
               currentPath = pathMatch[1];
               toolPaths[event.index] = currentPath;
            }
          }

          this.messages.update(msgs => {
            const newMsgs = [...msgs];
            const msg = newMsgs[assistantMsgIndex];
            if (currentPath) {
                msg.status = `Accessing ${currentPath}...`;
            } else {
                msg.status = 'Using tool...';
            }
            return newMsgs;
          });
        } else if (event.type === 'tool_call') {
            const { name, args } = event;
            this.messages.update(msgs => {
               const newMsgs = [...msgs];
               const msg = newMsgs[assistantMsgIndex];
               msg.status = `Executed ${name}${args.path ? ' ' + args.path : ''}...`;

               if (name === 'write_file' || name === 'edit_file') {
                   const files = msg.updatedFiles || [];
                   if (args.path && !files.includes(args.path)) {
                       msg.updatedFiles = [...files, args.path];
                   }
               }
               return newMsgs;
            });
        } else if (event.type === 'tool_result') {
            this.messages.update(msgs => {
               const newMsgs = [...msgs];
               const msg = newMsgs[assistantMsgIndex];
               const results = msg.toolResults || [];
               msg.toolResults = [...results, {
                  tool: event.name || 'tool',
                  result: event.result,
                  isError: event.isError
               }];
               return newMsgs;
            });
        } else if (event.type === 'usage') {
           this.messages.update(msgs => {
             const newMsgs = [...msgs];
             newMsgs[assistantMsgIndex].usage = event.usage;
             return newMsgs;
           });
        } else if (event.type === 'file_written') {
           this.hmrTrigger.triggerUpdate(event.path, event.content);
           this.progressiveStore.updateProgress(event.path, event.content, true);
           this.projectService.fileStore.updateFile(event.path, event.content);
        } else if (event.type === 'file_progress') {
           this.progressiveStore.updateProgress(event.path, event.content, event.isComplete);
        } else if (event.type === 'screenshot_request') {
           this.handleScreenshotRequest(event.requestId);
        } else if (event.type === 'question_request') {
           const defaultAnswers: Record<string, any> = {};
           for (const q of event.questions) {
             if (q.default !== undefined) {
               defaultAnswers[q.id] = q.default;
             }
           }

           this.messages.update(msgs => {
             const newMsgs = [...msgs];
             const msg = newMsgs[assistantMsgIndex];
             msg.pendingQuestion = {
               requestId: event.requestId,
               questions: event.questions,
               context: event.context,
               answers: defaultAnswers
             };
             msg.status = 'Waiting for your input...';
             return newMsgs;
           });
        } else if (event.type === 'result') {
          hasResult = true;
          try {
            this.attachedFileContent = null;
            this.attachedFile = null;
            this.annotationContext = null;
            this.figmaContext.set(null);
            this.figmaImages.set([]);

            const res = event.content;

            const current = this.projectService.files() || BASE_FILES;
            const projectFiles = this.projectService.mergeFiles(current, res.files);

            this.messages.update(msgs => {
              const newMsgs = [...msgs];
              newMsgs[assistantMsgIndex].files = projectFiles;
              newMsgs[assistantMsgIndex].commitSha = res.commitSha || undefined;
              newMsgs[assistantMsgIndex].model = res.model;
              newMsgs[assistantMsgIndex].duration = Date.now() - generationStartTime;
              newMsgs[assistantMsgIndex].status = undefined;
              return newMsgs;
            });

            this.projectService.fileStore.setFiles(projectFiles);
            this.loading.set(false);

          } catch (err) {
            console.error('Container error:', err);
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
        this.messages.update(msgs => {
            const newMsgs = [...msgs];
            newMsgs[assistantMsgIndex].status = undefined;
            return newMsgs;
        });
        this.progressiveStore.markAllComplete();
        this.activeSubscription = null;
      }
    });
  }

  cancelGeneration() {
    if (this.activeSubscription) {
      this.activeSubscription.unsubscribe();
      this.activeSubscription = null;
    }
    this.loading.set(false);
    this.messages.update(msgs => {
      const newMsgs = [...msgs];
      const last = newMsgs[newMsgs.length - 1];
      if (last?.role === 'assistant') {
        last.status = undefined;
        last.text = (last.text || '') + '\n\n*[Generation cancelled]*';
      }
      return newMsgs;
    });
    this.progressiveStore.markAllComplete();
  }

  private async handleScreenshotRequest(requestId: string) {
    console.log('[Screenshot] Request received:', requestId);

    try {
      const imageData = await this.screenshotService.captureThumbnail();

      if (!imageData) {
        await fetch(`http://localhost:3333/api/screenshot/${requestId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('adorable_token')}`
          },
          body: JSON.stringify({ error: 'Failed to capture screenshot - preview may not be available' })
        });
        return;
      }

      const response = await fetch(`http://localhost:3333/api/screenshot/${requestId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adorable_token')}`
        },
        body: JSON.stringify({ imageData })
      });

      const result = await response.json();
      console.log('[Screenshot] Response:', result);
    } catch (err) {
      console.error('[Screenshot] Error handling request:', err);
      try {
        await fetch(`http://localhost:3333/api/screenshot/${requestId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('adorable_token')}`
          },
          body: JSON.stringify({ error: `Screenshot capture failed: ${err}` })
        });
      } catch {
        // Ignore
      }
    }
  }

  ngOnDestroy() {
    this.activeSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
