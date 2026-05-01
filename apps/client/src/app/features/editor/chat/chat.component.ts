import { Component, inject, signal, computed, viewChild, output, input, effect, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ProjectService, ChatMessage, Question } from '../../../core/services/project';
import { ContainerEngine } from '../../../core/services/container-engine';
import { ApiService } from '../../../core/services/api';
import { ToastService } from '../../../core/services/toast';
import { ConfirmService } from '../../../core/services/confirm';
import { SkillsService, Skill } from '../../../core/services/skills';
import { SlashCommandService, SlashCommandItem, ProjectCommand } from '../../../core/services/slash-commands';
import { HMRTriggerService } from '../../../core/services/hmr-trigger.service';
import { ProgressiveEditorStore } from '../services/progressive-editor.store';
import { ScreenshotService } from '../../../core/services/screenshot';
import { getServerUrl } from '../../../core/services/server-url';
import { SafeUrlPipe } from '../../../shared/pipes/safe-url.pipe';
import { FigmaImportPayload } from '@adorable/shared-types';
import { FigmaBridgeService } from '../../../core/services/figma-bridge.service';
import { scopeFilesToSelectedApp, extractImageAssets, simplifyFigmaContext } from './chat-tree-helpers';

// Sub-components

import { ChatMessageListComponent } from './chat-message-list/chat-message-list.component';
import { ChatInputComponent } from './chat-input/chat-input.component';
import { AiSettingsPopoverComponent } from './ai-settings-popover/ai-settings-popover.component';
import { McpToolsPanelComponent } from './mcp-tools-panel/mcp-tools-panel.component';
import { ContextPreviewModalComponent, ContextPreviewData } from './context-preview-modal/context-preview-modal.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    FormsModule,
    SafeUrlPipe,

    ChatMessageListComponent,
    ChatInputComponent,
    AiSettingsPopoverComponent,
    McpToolsPanelComponent,
    ContextPreviewModalComponent
  ],
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss']
})
export class ChatComponent {
  // Emit on this Subject to cancel any in-flight generateStream subscription.
  // Combined with takeUntilDestroyed below it covers both user-initiated cancel
  // (cancelGeneration / project switch) and component teardown.
  private cancelGeneration$ = new Subject<void>();
  private destroyRef = inject(DestroyRef);
  private apiService = inject(ApiService);
  public containerEngine = inject(ContainerEngine);
  public projectService = inject(ProjectService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private skillsService = inject(SkillsService);
  private slashCommandService = inject(SlashCommandService);
  private hmrTrigger = inject(HMRTriggerService);
  private progressiveStore = inject(ProgressiveEditorStore);
  private screenshotService = inject(ScreenshotService);
  private figmaBridge = inject(FigmaBridgeService);

  private messageList = viewChild<ChatMessageListComponent>('messageList');
  private chatInput = viewChild<ChatInputComponent>('chatInput');

  // Inputs from parent
  appSettings = input<any>(null);
  visualEditorData = input<any>(signal(null));
  pendingFigmaImport = input<FigmaImportPayload | null>(null);

  // Outputs
  fileUploaded = output<{name: string, content: string}>();
  figmaImportProcessed = output<void>();
  popoverToggled = output<boolean>();

  messages = this.projectService.messages;
  loading = this.projectService.loading;

  prompt = signal('');

  // UI State
  compactMode = signal(true);
  shouldAddToAssets = signal(true);
  attachedFile = signal<File | null>(null);
  attachedFileContent = signal<string | null>(null);
  annotationContext = signal<string | null>(null);
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

  // Project Commands (slash commands)
  projectCommands = signal<ProjectCommand[]>([]);
  allSlashCommands = computed(() =>
    this.slashCommandService.buildCommandList(this.availableSkills(), this.projectCommands())
  );

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

  // Context Preview
  contextPreviewData = signal<ContextPreviewData | null>(null);
  contextPreviewLoading = signal(false);

  // Conversation history context
  private contextSummary = signal<string | null>(null);
  private contextCleared = signal(false);

  isAttachedImage = computed(() => {
    if (this.attachedFile()?.type.startsWith('image/')) return true;
    if (this.attachedFileContent()?.startsWith('data:image/')) return true;
    return false;
  });

  hasFigmaAttachment = computed(() => this.figmaImages().length > 0);
  figmaFrameCount = computed(() => this.figmaImages().length);

  quickStarters = [
    {
      label: 'Cyberpunk SaaS Dashboard',
      description: 'Analytics with neon cyan/pink, glassmorphism sidebar, and real-time data visualizations.',
      prompt: 'Create a high-fidelity SaaS Analytics Dashboard with a "Cyberpunk" aesthetic. Color palette: Deep void black background, neon cyan (#00f3ff) and hot pink (#ff00ff) data accents. Features: A glassmorphism sidebar with glowing active states, a real-time "Live Traffic" area chart with a gradient fill, and "Server Health" cards using radial progress bars. Typography: JetBrains Mono for data, Inter for UI. Use CSS Grid, translucent card backgrounds with backdrop-filter: blur(10px), and subtle 1px borders.'
    },
    {
      label: 'Luxury E-Commerce',
      description: 'Minimalist product showcase with bold black typography, split layout, and smooth accordion animations.',
      prompt: 'Build a premium e-commerce product page for a limited edition sneaker brand. Design style: "Hypebeast Minimalist". Background: Stark white (#ffffff) with massive, bold black typography (Helvetica Now). Layout: Split screen - left side fixed product details with a sticky "Add to Cart" button (pill shape, black), right side scrollable gallery of large, high-res images. Include a "Details" accordion with smooth animations and a "You might also like" horizontal scroll slider.'
    },
    {
      label: 'Smart Home Hub',
      description: 'Futuristic control center with warm neumorphic palettes, interactive dial controls, and status badges.',
      prompt: 'Design a futuristic Smart Home Control Hub. Aesthetic: "Soft UI" / Neumorphism influence but flatter. Palette: Warm off-white background, soft rounded shadows, and vivid orange/purple gradients for active states. Components: A "Climate" card with a circular interactive temperature dial, "Lighting" scene buttons that glow when active, and a "Security" feed showing a mock live camera view with a "System Armed" status badge. Use heavy border-radius (24px) and fluid hover states.'
    },
    {
      label: 'Travel Journal',
      description: 'Editorial magazine layout with immersive full-screen photography, parallax headers, and masonry grids.',
      prompt: 'Create an immersive Travel Journal app. Visual style: "Editorial Magazine". The layout relies on full-screen background photography with overlaying text. Hero section: A parallax scrolling header with a dramatic title "Lost in Tokyo". Content: A masonry grid of photo cards with elegant white captions on hover. Typography: Playfair Display (Serif) for headings to give a premium feel, paired with DM Sans. Use varying aspect ratios for images and generous whitespace.'
    }
  ];

  constructor() {
    this.loadSkills();
    this.loadKits();
    this.loadProjectCommands();

    // Cancel any active generation when the project is being switched
    this.projectService.projectSwitching$.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      if (this.loading()) {
        console.log('[ChatComponent] Cancelling active generation due to project switch');
        this.cancelGeneration$.next();
        this.loading.set(false);
        this.progressiveStore.markAllComplete();
      }
    });

    // Auto-scroll when messages change
    effect(() => {
        this.messages();
        setTimeout(() => {
          this.messageList()?.checkAutoScroll();
        }, 0);
    });

    // Raise sidebar z-index when context preview modal is open
    effect(() => {
      this.popoverToggled.emit(!!this.contextPreviewData());
    });

    // Load models when appSettings changes
    effect(() => {
      const settings = this.appSettings();
      if (settings) {
        this.loadAvailableModels();
      }
    });

    // Process Figma imports
    effect(() => {
      const payload = this.pendingFigmaImport();
      if (payload) {
        this.handleFigmaImport(payload);
        this.figmaImportProcessed.emit();
      }
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
    this.skillsService.getSkills().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (skills) => this.availableSkills.set(skills),
      error: () => console.warn('Failed to load skills for chat')
    });
  }

  loadKits() {
    this.apiService.listKits().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => this.availableKits.set(result.kits || []),
      error: () => console.warn('Failed to load kits for chat')
    });
  }

  loadProjectCommands() {
    const projectId = this.projectService.projectId();
    if (!projectId) return;
    this.apiService.getProjectCommands(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => this.projectCommands.set(result.commands || []),
      error: () => console.warn('Failed to load project commands')
    });
  }

  handleSlashCommand(item: SlashCommandItem) {
    switch (item.type) {
      case 'action':
        if (item.id === 'plan') {
          this.planMode.set(!this.planMode());
          this.toastService.show(this.planMode() ? 'Plan mode ON' : 'Plan mode OFF', 'info');
        } else if (item.id === 'compact') {
          this.compactMode.set(!this.compactMode());
          this.toastService.show(this.compactMode() ? 'Compact mode ON' : 'Compact mode OFF', 'info');
        } else if (item.id === 'clear') {
          this.clearContext();
          this.toastService.show('Context cleared', 'info');
        } else if (item.id === 'debug:context') {
          this.previewContext();
        }
        break;
      case 'skill':
        this.selectedSkill.set(item.data);
        this.toastService.show(`Skill: ${item.data.name}`, 'info');
        break;
      case 'project': {
        const cmd = item.data as ProjectCommand;
        if (cmd.hasArguments) {
          // Set prompt to command prefix so user can type arguments
          this.prompt.set(`/${item.label.substring(1)} `);
          this.chatInput()?.focusAndResize();
        } else {
          // Inject content as prompt and auto-send
          this.prompt.set(cmd.content);
          this.generate();
        }
        break;
      }
    }
  }

  handleModelSelected(model: any) {
    this.selectedModel.set(model);
    this.toastService.show(`Model: ${model.name || model.id}`, 'info');
  }

  loadMcpTools() {
    this.mcpToolsLoading.set(true);
    this.apiService.getAvailableMcpTools().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    const settings = this.appSettings();
    if (!settings) return;

    let profiles = settings.profiles;

    // Handle Legacy
    if (!profiles && settings.provider) {
        profiles = [{
            id: 'legacy',
            name: settings.provider,
            provider: settings.provider,
            apiKey: settings.apiKey,
            model: settings.model
        }];
    }

    if (!profiles || profiles.length === 0) return;

    profiles.forEach((profile: any) => {
       if (profile.provider === 'figma') return;

       // Claude Code: add static model list (no API call)
       if (profile.provider === 'claude-code') {
         const ccModels = [
           { id: 'sonnet', name: 'Claude Code - Sonnet (latest)', provider: 'claude-code' },
           { id: 'opus', name: 'Claude Code - Opus (latest)', provider: 'claude-code' },
           { id: 'haiku', name: 'Claude Code - Haiku (latest)', provider: 'claude-code' },
           { id: 'claude-opus-4-7', name: 'Claude Code - Opus 4.7', provider: 'claude-code' },
           { id: 'claude-sonnet-4-6', name: 'Claude Code - Sonnet 4.6', provider: 'claude-code' },
           { id: 'claude-opus-4-6', name: 'Claude Code - Opus 4.6', provider: 'claude-code' },
           { id: 'claude-haiku-4-5', name: 'Claude Code - Haiku 4.5', provider: 'claude-code' },
         ];
         this.availableModels.update(current => {
           const existingIds = new Set(current.map(c => c.id));
           const toAdd = ccModels.filter(n => !existingIds.has(n.id));
           return [...current, ...toAdd];
         });
         return;
       }

       if (profile.apiKey) {
          let providerParam = profile.provider;
          if (providerParam === 'gemini') providerParam = 'google';

          this.apiService.getModels(providerParam, profile.apiKey).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
                   const activeProfile = settings?.profiles?.find((p: any) => p.id === settings.activeProfileId);
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
    this.attachedFileContent.set(image);
    this.annotationContext.set(null);
  }

  setAnnotatedImage(image: string, annotations: { texts: string[]; hasArrows: boolean; hasRectangles: boolean; hasFreehand: boolean }) {
    this.attachedFileContent.set(image);

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

    this.annotationContext.set(parts.length > 0 ? parts.join(' ') : null);
  }

  // ===== Quick Starters =====

  useQuickStarter(prompt: string) {
    this.prompt.set(prompt);
    this.chatInput()?.focusAndResize();
  }

  // ===== Visual Editor =====

  onAiChangeRequested(prompt: string) {
    this.prompt.set(prompt);
    this.generate();
  }

  previewAiChange(prompt: string) {
    this.prompt.set(prompt);
    this.previewContext();
  }

  // ===== File Upload Handlers =====

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.processFile(file);
    }
  }

  private processFile(file: File) {
    this.attachedFile.set(file);
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.attachedFileContent.set(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  removeAttachment() {
    this.attachedFileContent.set(null);
    this.attachedFile.set(null);
    this.annotationContext.set(null);
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

    this.prompt.set(repairPrompt);
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
        const result = await firstValueFrom(this.apiService.restoreVersion(projectId, filesOrSha));
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

    this.apiService.submitQuestionAnswers(requestId, answers).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

    this.apiService.cancelQuestion(requestId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

  /** Template-bound: shown as attachable thumbnails in the chat UI. */
  getProjectImageAssets(): { path: string; name: string }[] {
    return extractImageAssets(this.projectService.files());
  }

  // ===== Figma =====

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

    this.prompt.set(`Create Angular components from this Figma design:

File: ${payload.fileName}
Selected Frames:
${frameList}

Please analyze the design images and structure, then create the corresponding Angular components with accurate styling.`);

    this.chatInput()?.focusAndResize();
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

  /**
   * Return the file tree scoped to the selected app when this is an Nx monorepo.
   * Sending the full workspace tree can exceed 600k tokens for large monorepos.
   * The AI can explore libraries on demand via read_files / run_command.
   *
   * The returned tree preserves the full directory nesting (e.g. apps/my-app/src/...)
   * so that paths in the tree summary match the actual filesystem paths the AI
   * tools (read_file, write_file, etc.) operate on.
   */
  getScopedFiles(): any {
    return scopeFilesToSelectedApp(
      this.projectService.files(),
      this.projectService.detectedConfig()?.selectedApp,
    );
  }

  // ===== Generation =====

  async generate() {
    if (!this.prompt()) return;

    this.messages.update(msgs => [...msgs, {
      role: 'user',
      text: this.prompt(),
      timestamp: new Date(),
      files: this.projectService.files()
    }]);

    let currentPrompt = this.prompt();
    this.prompt.set('');
    this.chatInput()?.resetTextareaHeight();
    this.loading.set(true);
    const generationStartTime = Date.now();

    if (this.attachedFileContent() && this.attachedFile()) {
      this.fileUploaded.emit({name: this.attachedFile()!.name, content: this.attachedFileContent()!});

      if (this.shouldAddToAssets() && this.isAttachedImage()) {
        const targetPath = `public/assets/${this.attachedFile()!.name}`;
        currentPrompt += `

[System Note: I have automatically uploaded the attached image to "${targetPath}". You can use it in your code like <img src="assets/${this.attachedFile()!.name}">]`;
      } else {
         currentPrompt += `

[System Note: The user has attached a file named "${this.attachedFile()!.name}". It is available in the input context.]`;
      }
    }

    if (this.figmaContext()) {
      const simplifiedContext = simplifyFigmaContext(this.figmaContext());
      currentPrompt += `

--- Figma Design Context ---
<figma_summary>
${simplifiedContext}
</figma_summary>

Analyze the attached design images carefully and create matching Angular components. The summary above provides structural hints.`;
    }

    if (this.annotationContext()) {
      currentPrompt += `

[Annotated Screenshot: The attached image is a screenshot of the user's live app with visual annotations drawn on top. The colored marks (arrows, rectangles, freehand strokes, text labels) are the user's annotations — NOT part of the actual app UI. ${this.annotationContext()} Interpret these annotations as instructions for what the user wants changed in the code.]`;
      this.annotationContext.set(null);
    }

    const assistantMsgIndex = this.messages().length;
    this.messages.update(msgs => [...msgs, {
      role: 'assistant',
      text: '',
      timestamp: new Date(),
      updatedFiles: []
    }]);

    const previousFiles = this.getScopedFiles();

    let fullStreamText = '';
    let hasResult = false;
    const toolInputs: {[key: number]: string} = {};
    const toolPaths: {[key: number]: string} = {};

    let provider = 'anthropic';
    let apiKey = '';
    let model = '';
    let builtInTools: { webSearch?: boolean, urlContext?: boolean } | undefined;
    let hasFileWrites = false;

    const settings = this.appSettings();
    if (settings) {
      if (settings.profiles && settings.activeProfileId) {
         const active = settings.profiles.find((p: any) => p.id === settings.activeProfileId);
         if (active) {
            provider = active.provider;
            apiKey = active.apiKey;
            model = active.model;
            builtInTools = active.builtInTools;
         }
      } else {
         provider = settings.provider || provider;
         apiKey = settings.apiKey || apiKey;
         model = settings.model || model;
      }
    }

    // Model selector override
    const currentSelection = this.selectedModel();
    if (currentSelection && currentSelection.id) {
      if (provider === 'claude-code') {
        // Claude Code: only update model, keep provider as claude-code
        if (currentSelection.provider === 'claude-code') {
          model = currentSelection.id;
        }
      } else {
        provider = currentSelection.provider;
        model = currentSelection.id;
        if (settings?.profiles) {
           const profileForProvider = settings.profiles.find((p: any) => p.provider === provider);
           if (profileForProvider) {
               apiKey = profileForProvider.apiKey;
               builtInTools = profileForProvider.builtInTools;
           }
        }
      }
    }

    const allImages: string[] = [];
    if (this.attachedFileContent()) {
      allImages.push(this.attachedFileContent()!);
    }
    if (this.figmaImages().length > 0) {
      allImages.push(...this.figmaImages());
    }

    // Build conversation history (skip if context was cleared)
    let historyToSend: { role: string; text: string }[] | undefined;
    let summaryToSend: string | undefined;

    if (!this.contextCleared()) {
      const history: { role: string; text: string }[] = [];
      const currentMessages = this.messages();
      // Exclude the last message (current user prompt just added above)
      for (let i = 0; i < currentMessages.length - 1; i++) {
        const msg = currentMessages[i];
        if (msg.role === 'system' || !msg.text?.trim()) continue;
        history.push({ role: msg.role, text: msg.text });
      }
      if (this.contextSummary() && history.length > 6) {
        summaryToSend = this.contextSummary()!;
        historyToSend = history.slice(-6);
      } else {
        historyToSend = history.length > 20 ? history.slice(-20) : history;
      }
    }
    this.contextCleared.set(false);

    console.log('[Generate] Sending request with:', {
      promptLength: currentPrompt.length,
      imageCount: allImages.length,
      hasFigmaContext: !!this.figmaContext(),
      historyLength: historyToSend?.length || 0,
      hasContextSummary: !!summaryToSend
    });

    this.apiService.generateStream(currentPrompt, previousFiles, {
      provider,
      apiKey,
      model,
      images: allImages.length > 0 ? allImages : undefined,
      openFiles: this.getContextFiles(),
      forcedSkill: this.selectedSkill()?.name,
      planMode: this.planMode(),
      kitId: this.projectService.selectedKitId() || undefined,
      projectId: this.projectService.projectId() || undefined,
      selectedApp: this.projectService.detectedConfig()?.selectedApp || undefined,
      previewRoute: this.containerEngine.previewRoute() || undefined,
      builtInTools,
      reasoningEffort: this.reasoningEffort(),
      history: historyToSend?.length ? historyToSend : undefined,
      contextSummary: summaryToSend,
      figmaNodeAnnotations: this.figmaBridge.nodeAnnotations() || undefined
    }).pipe(takeUntil(this.cancelGeneration$), takeUntilDestroyed(this.destroyRef)).subscribe({
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
             newMsgs[assistantMsgIndex].usage = {
               ...event.usage,
               ...(event.cost ? { cost: event.cost } : {})
             };
             return newMsgs;
           });
        } else if (event.type === 'file_written') {
           hasFileWrites = true;
           this.hmrTrigger.triggerUpdate(event.path, event.content);
           this.progressiveStore.updateProgress(event.path, event.content, true);
           this.projectService.fileStore.updateFile(event.path, event.content);
           // Auto-reload translations when the AI writes a JSON file (same as visual editor)
           if (event.path.endsWith('.json') || event.path.endsWith('.jsonc')) {
             this.hmrTrigger.reloadTranslations(event.content);
           }
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
            this.attachedFileContent.set(null);
            this.attachedFile.set(null);
            this.annotationContext.set(null);
            this.figmaContext.set(null);
            this.figmaImages.set([]);

            const res = event.content;

            const current = this.projectService.files() || {};
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

            // Claude Code writes files directly to disk — the dev server's HMR may get
            // stuck on intermediate broken states. Force a preview reload after generation.
            if (provider === 'claude-code' && hasFileWrites) {
              setTimeout(() => this.hmrTrigger.forceReload(), 1500);
            }

            // Background: summarize context if conversation is getting long
            const allMsgs = this.messages();
            const textMsgs = allMsgs.filter(m => m.role !== 'system' && m.text?.trim());
            if (textMsgs.length > 10 && !this.contextSummary()) {
              const toSummarize = textMsgs.slice(0, -6).map(m => ({ role: m.role, text: m.text }));
              this.apiService.summarizeContext(toSummarize).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
                next: (res) => { if (res.summary) this.contextSummary.set(res.summary); },
                error: () => {} // Non-fatal
              });
            }

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
        if (err?.code === 'CLOUD_EDITOR_ACCESS_DENIED') {
          this.projectService.cloudEditorBlocked.set('access_denied');
          this.projectService.addSystemMessage('Cloud editor access is restricted. Please use the desktop app or contact an administrator.');
        } else if (err?.code === 'CONTAINER_CAPACITY_REACHED') {
          this.projectService.cloudEditorBlocked.set('capacity');
          this.projectService.addSystemMessage('Server is at capacity. Please try again later or use the desktop app.');
        } else if (err?.status === 400 && err?.error?.includes('No API Key')) {
          this.projectService.addSystemMessage('No API key configured for this provider. Go to Profile → API Keys to add one.');
        } else {
          this.projectService.addSystemMessage('Failed to generate code. Please try again.');
        }
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
      }
    });
  }

  async previewContext() {
    if (this.contextPreviewLoading()) return;
    const currentPrompt = this.prompt() || '(debug preview)';
    if (!currentPrompt.trim()) return;

    let provider = 'anthropic';
    let apiKey = '';
    let model = '';
    let builtInTools: { webSearch?: boolean, urlContext?: boolean } | undefined;

    const settings = this.appSettings();
    if (settings) {
      if (settings.profiles && settings.activeProfileId) {
        const active = settings.profiles.find((p: any) => p.id === settings.activeProfileId);
        if (active) {
          provider = active.provider;
          apiKey = active.apiKey;
          model = active.model;
          builtInTools = active.builtInTools;
        }
      } else {
        provider = settings.provider || provider;
        apiKey = settings.apiKey || apiKey;
        model = settings.model || model;
      }
    }

    // Model selector override
    const currentSelection2 = this.selectedModel();
    if (currentSelection2 && currentSelection2.id) {
      if (provider === 'claude-code') {
        if (currentSelection2.provider === 'claude-code') {
          model = currentSelection2.id;
        }
      } else {
        provider = currentSelection2.provider;
        model = currentSelection2.id;
        if (settings?.profiles) {
          const profileForProvider = settings.profiles.find((p: any) => p.provider === provider);
          if (profileForProvider) {
            apiKey = profileForProvider.apiKey;
            builtInTools = profileForProvider.builtInTools;
          }
        }
      }
    }

    const previousFiles = this.getScopedFiles();

    let historyToSend: { role: string; text: string }[] | undefined;
    let summaryToSend: string | undefined;
    if (!this.contextCleared()) {
      const history: { role: string; text: string }[] = [];
      for (const msg of this.messages()) {
        if (msg.role === 'system' || !msg.text?.trim()) continue;
        history.push({ role: msg.role, text: msg.text });
      }
      if (this.contextSummary() && history.length > 6) {
        summaryToSend = this.contextSummary()!;
        historyToSend = history.slice(-6);
      } else {
        historyToSend = history.length > 20 ? history.slice(-20) : history;
      }
    }

    this.contextPreviewLoading.set(true);
    this.apiService.previewContext(currentPrompt, previousFiles, {

      provider, apiKey, model,
      openFiles: this.getContextFiles(),
      forcedSkill: this.selectedSkill()?.name,
      planMode: this.planMode(),
      kitId: this.projectService.selectedKitId() || undefined,
      projectId: this.projectService.projectId() || undefined,
      builtInTools,
      reasoningEffort: this.reasoningEffort(),
      history: historyToSend?.length ? historyToSend : undefined,
      contextSummary: summaryToSend,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data: ContextPreviewData) => {
        this.contextPreviewData.set(data);
        this.contextPreviewLoading.set(false);
      },
      error: (err: any) => {
        console.error('[ContextPreview] Failed:', err);
        this.contextPreviewLoading.set(false);
        this.toastService.show('Failed to load context preview', 'error');
      }
    });
  }

  clearContext() {
    this.contextSummary.set(null);
    this.contextCleared.set(true);

    // Clear Claude Code session so next turn starts fresh
    const projectId = this.projectService.projectId();
    if (projectId) {
      this.apiService.clearClaudeCodeSession(projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    }
  }

  cancelGeneration() {
    this.cancelGeneration$.next();
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
        await fetch(`${getServerUrl()}/api/screenshot/${requestId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('adorable_token')}`
          },
          body: JSON.stringify({ error: 'Failed to capture screenshot - preview may not be available' })
        });
        return;
      }

      const response = await fetch(`${getServerUrl()}/api/screenshot/${requestId}`, {
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
        await fetch(`${getServerUrl()}/api/screenshot/${requestId}`, {
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
}
