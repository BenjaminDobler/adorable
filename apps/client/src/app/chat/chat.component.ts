import { Component, inject, signal, ElementRef, ViewChild, Output, EventEmitter, Input, effect, computed, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService, ChatMessage, Question } from '../services/project';
import { ContainerEngine } from '../services/container-engine';
import { ApiService } from '../services/api';
import { ToastService } from '../services/toast';
import { ConfirmService } from '../services/confirm';
import { TemplateService } from '../services/template';
import { SkillsService, Skill } from '../services/skills';
import { HMRTriggerService } from '../services/hmr-trigger.service';
import { ProgressiveEditorStore } from '../services/progressive-editor.store';
import { ScreenshotService } from '../services/screenshot';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { MarkdownPipe } from '../pipes/markdown.pipe';
import { BASE_FILES } from '../base-project';
import { FigmaImportPayload } from '@adorable/shared-types';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, SafeUrlPipe, MarkdownPipe],
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss']
})
export class ChatComponent implements OnDestroy {
  private activeSubscription: Subscription | null = null;
  private apiService = inject(ApiService);
  public webContainerService = inject(ContainerEngine);
  public projectService = inject(ProjectService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private templateService = inject(TemplateService);
  private skillsService = inject(SkillsService);
  private hmrTrigger = inject(HMRTriggerService);
  private progressiveStore = inject(ProgressiveEditorStore);
  private screenshotService = inject(ScreenshotService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('promptTextarea') private promptTextarea!: ElementRef;

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

  messages = this.projectService.messages;
  loading = this.projectService.loading;
  
  prompt = '';
  visualPrompt = '';
  
  // Visual Edit State
  editText = '';
  editColor = '#000000';
  editBgColor = 'transparent';
  editFontSize = '16px';
  editFontWeight = '400';
  editTextAlign = 'left';
  editMarginTop = 0;
  editMarginRight = 0;
  editMarginBottom = 0;
  editMarginLeft = 0;
  editPaddingTop = 0;
  editPaddingRight = 0;
  editPaddingBottom = 0;
  editPaddingLeft = 0;
  editBorderRadius = 0;
  editDisplay = 'block';
  editFlexDirection = 'row';
  editJustifyContent = 'flex-start';
  editAlignItems = 'stretch';
  editGap = 0;
  
  // UI State
  compactMode = signal(true); // Default to compact
  private isUserAtBottom = true; // Track scroll position

  shouldAddToAssets = signal(true);
  attachedFile: File | null = null;
  attachedFileContent: string | null = null;
  annotationContext: string | null = null;
  isDragging = false;
  previewImageUrl = signal<string | null>(null);

  availableModels = signal<any[]>([
    { id: 'auto', name: '✨ Auto (Smart)', provider: 'auto' }
  ]);

  selectedModel = signal(this.availableModels()[0]);

  availableSkills = signal<Skill[]>([]);
  selectedSkill = signal<Skill | null>(null);

  // MCP Tools
  mcpToolsVisible = signal(false);
  mcpToolsLoading = signal(false);
  mcpServers = signal<{ id: string; name: string; url: string; enabled: boolean }[]>([]);
  mcpTools = signal<{ name: string; originalName: string; description: string; serverId: string }[]>([]);

  // Figma import state
  figmaContext = signal<any>(null);
  figmaImages = signal<string[]>([]);

  // Plan Mode - forces AI to ask clarifying questions before coding
  planMode = signal(false);

  // Keyboard navigation state for question panel
  focusedQuestionIndex = signal(-1);
  focusedOptionIndex = signal(-1);

  get isAttachedImage(): boolean {
    if (this.attachedFile?.type.startsWith('image/')) return true;
    if (this.attachedFileContent?.startsWith('data:image/')) return true;
    return false;
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

    effect(() => {
        // Auto-scroll when messages change, but only if user is at bottom
        this.messages();
        setTimeout(() => {
          if (this.isUserAtBottom) {
            this.scrollToBottom();
          }
        }, 0);
    });
    
    effect(() => {
       const data = this.visualEditorData();
       if (data) {
          this.editText = data.text || '';
          this.editColor = this.rgbToHex(data.styles?.color) || '#000000';
          this.editBgColor = this.rgbToHex(data.styles?.backgroundColor) || 'transparent';
          this.editFontSize = data.styles?.fontSize || '16px';
          this.editFontWeight = data.styles?.fontWeight || '400';
          this.editTextAlign = data.styles?.textAlign || 'left';
          this.editMarginTop = this.parsePixelValue(data.styles?.marginTop);
          this.editMarginRight = this.parsePixelValue(data.styles?.marginRight);
          this.editMarginBottom = this.parsePixelValue(data.styles?.marginBottom);
          this.editMarginLeft = this.parsePixelValue(data.styles?.marginLeft);
          this.editPaddingTop = this.parsePixelValue(data.styles?.paddingTop);
          this.editPaddingRight = this.parsePixelValue(data.styles?.paddingRight);
          this.editPaddingBottom = this.parsePixelValue(data.styles?.paddingBottom);
          this.editPaddingLeft = this.parsePixelValue(data.styles?.paddingLeft);
          this.editBorderRadius = this.parsePixelValue(data.styles?.borderRadius);
          this.editDisplay = data.styles?.display || 'block';
          this.editFlexDirection = data.styles?.flexDirection || 'row';
          this.editJustifyContent = data.styles?.justifyContent || 'flex-start';
          this.editAlignItems = data.styles?.alignItems || 'stretch';
          this.editGap = this.parsePixelValue(data.styles?.gap);
       }
    });

    // Auto-enable agent mode for Docker/Native, disable for WebContainer
    effect(() => {
       const mode = this.webContainerService.mode();
       this.projectService.agentMode.set(mode === 'local' || mode === 'native');
    });
  }

  loadSkills() {
    this.skillsService.getSkills().subscribe({
      next: (skills) => this.availableSkills.set(skills),
      error: () => console.warn('Failed to load skills for chat')
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

  getToolsForServer(serverId: string) {
    return this.mcpTools().filter(t => t.serverId === serverId);
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

    const models: any[] = [{ id: 'auto', name: '✨ Auto (Smart)', provider: 'auto' }];
    
    profiles.forEach((profile: any) => {
       // Skip non-AI providers like Figma
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
                
                // Merge and dedup
                this.availableModels.update(current => {
                   const existingIds = new Set(current.map(c => c.id));
                   const toAdd = newModels.filter((n: any) => !existingIds.has(n.id));
                   return [...current, ...toAdd];
                });
             },
             error: (err) => console.error(`Failed to fetch models for chat dropdown (${profile.provider})`, err)
          });
       }
    });
  }

  useQuickStarter(prompt: string) {
    this.prompt = prompt;
    setTimeout(() => {
        const textarea = this.promptTextarea?.nativeElement;
        if (textarea) {
          textarea.focus();
          this.autoResize();
        }
    }, 0);
  }

  setImage(image: string) {
    this.attachedFileContent = image;
    this.annotationContext = null;
    this.isDragging = false;
    this.cdr.markForCheck();
  }

  setAnnotatedImage(image: string, annotations: { texts: string[]; hasArrows: boolean; hasRectangles: boolean; hasFreehand: boolean }) {
    this.attachedFileContent = image;

    // Build structured annotation context for the AI prompt
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
    this.isDragging = false;
    this.cdr.markForCheck();
  }

  closeVisualEditor() {
    this.closeVisualEdit.emit();
  }

  applyVisualEdit(type: 'text' | 'style', value: string, property?: string) {
    if (!this.visualEditorData()) return;
    
    // We construct a "Fingerprint" from the runtime data
    const data = this.visualEditorData();
    const fingerprint = {
       componentName: data.componentName,
       hostTag: data.hostTag,
       tagName: data.tagName,
       text: data.text, // The ORIGINAL text from runtime
       classes: data.classes,
       id: data.attributes?.id,
       childIndex: data.childIndex,
       parentTag: data.parentTag
    };
    
    const result = this.templateService.findAndModify(fingerprint, { type, value, property });
    
    if (result.success) {
       // Update Project Service via Store
       this.projectService.fileStore.updateFile(result.path, result.content);
       
       // Reload Preview
       this.webContainerService.writeFile(result.path, result.content);
       this.toastService.show('Update applied', 'success');
       
       // Update local state so subsequent edits work (we need to track the NEW text)
       if (type === 'text') {
          this.visualEditorData.update(d => ({ ...d, text: value }));
       }
    } else {
       console.error('Visual Edit Failed:', result.error);
       this.toastService.show(result.error || 'Failed to apply edit', 'error');
    }
  }

  applyVisualChanges(prompt: string) {
    if (!this.visualEditorData()) return;

    const data = this.visualEditorData();
    const specificContext = data.componentName
      ? `This change likely involves ${data.componentName}.`
      : '';

    this.prompt = `Visual Edit Request:\nTarget Element: \`<${data.tagName}>\` class=\`"${data.classes}"\`\nOriginal Text: \`"${data.text}"\`\n${specificContext}\n\nInstruction: ${prompt}`;

    this.generate();
    this.closeVisualEditor();
  }

  // ===== Visual Editor Helper Methods =====

  private parsePixelValue(value: string | undefined): number {
    if (!value) return 0;
    const match = value.match(/^(-?\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }

  private rgbToHex(rgb: string | undefined): string {
    if (!rgb) return '#000000';
    if (rgb.startsWith('#')) return rgb;
    if (rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return 'transparent';

    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return rgb;
  }

  isContainerElement(): boolean {
    const data = this.visualEditorData();
    if (!data) return false;

    const containerTags = ['div', 'section', 'main', 'aside', 'article', 'nav', 'header', 'footer', 'ul', 'ol', 'form', 'fieldset'];
    return containerTags.includes(data.tagName.toLowerCase());
  }

  selectFromBreadcrumb(item: any, index: number) {
    // Post message to iframe to select a parent element
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'SELECT_ELEMENT',
        elementId: item.elementId,
        tagName: item.tagName,
        index: index
      }, '*');
    }
  }

  setFontSize(size: string) {
    this.editFontSize = size;
    this.applyVisualEdit('style', size, 'font-size');
  }

  setFontWeight(weight: string) {
    this.editFontWeight = weight;
    this.applyVisualEdit('style', weight, 'font-weight');
  }

  setTextAlign(align: string) {
    this.editTextAlign = align;
    this.applyVisualEdit('style', align, 'text-align');
  }

  applySpacing(property: string, value: number) {
    this.applyVisualEdit('style', value + 'px', property);
  }

  setDisplay(display: string) {
    this.editDisplay = display;
    this.applyVisualEdit('style', display, 'display');
  }

  setFlexDirection(direction: string) {
    this.editFlexDirection = direction;
    this.applyVisualEdit('style', direction, 'flex-direction');
  }

  setJustifyContent(justify: string) {
    this.editJustifyContent = justify;
    this.applyVisualEdit('style', justify, 'justify-content');
  }

  setAlignItems(align: string) {
    this.editAlignItems = align;
    this.applyVisualEdit('style', align, 'align-items');
  }

  autoRepair(error: string) {
    this.projectService.addSystemMessage('Build error detected. Requesting fix...');
    
    const repairPrompt = `The application failed to build with the following errors. Please investigate and fix the code.
    
    Errors:
    ${error}`;

    this.prompt = repairPrompt;
    this.generate();
  }

  async restoreVersion(files: any) {
    if (!files || this.loading()) return;
    const confirmed = await this.confirmService.confirm(
      'Are you sure you want to restore this version? Current unsaved changes might be lost.',
      'Restore',
      'Cancel'
    );
    if (confirmed) {
      this.loading.set(true);
      await this.projectService.reloadPreview(files);
      this.projectService.addSystemMessage('Restored project to previous version.');
      this.toastService.show('Version restored', 'info');
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
    if (file) {
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

  get hasFigmaAttachment(): boolean {
    return this.figmaImages().length > 0;
  }

  get figmaFrameCount(): number {
    return this.figmaImages().length;
  }

  /**
   * Simplify Figma context to avoid token limits.
   * Extracts only essential structure info (names, types, dimensions).
   */
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
    if (depth > 3) return ''; // Limit depth to avoid huge outputs

    const indent = '  '.repeat(depth);
    const dims = node.absoluteBoundingBox
      ? ` (${Math.round(node.absoluteBoundingBox.width)}×${Math.round(node.absoluteBoundingBox.height)})`
      : '';

    let line = `${indent}- ${node.name} [${node.type}]${dims}`;

    if (node.children && node.children.length > 0 && depth < 3) {
      const childSummaries = node.children
        .slice(0, 10) // Limit to first 10 children
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

  /**
   * Handle Figma design import from the Figma panel
   */
  handleFigmaImport(payload: FigmaImportPayload) {
    console.log('[Figma Import] Received payload:', {
      fileName: payload.fileName,
      selectionCount: payload.selection?.length,
      imageCount: payload.imageDataUris?.length,
      hasJsonStructure: !!payload.jsonStructure
    });

    // Store images for attachment
    this.figmaImages.set(payload.imageDataUris || []);

    // Store JSON structure for context
    this.figmaContext.set(payload.jsonStructure);

    // Build frame list for prompt
    const frameList = payload.selection.map(s => `- ${s.nodeName} (${s.nodeType})`).join('\n');

    // Pre-fill prompt with context
    this.prompt = `Create Angular components from this Figma design:

File: ${payload.fileName}
Selected Frames:
${frameList}

Please analyze the design images and structure, then create the corresponding Angular components with accurate styling.`;

    // Focus the textarea and auto-resize
    setTimeout(() => {
      const textarea = this.promptTextarea?.nativeElement;
      if (textarea) {
        textarea.focus();
        this.autoResize();
      }
    }, 0);
  }

  onScroll(): void {
    if (!this.scrollContainer) return;
    const el = this.scrollContainer.nativeElement;
    // Consider "at bottom" if within 100px of the bottom
    const threshold = 100;
    this.isUserAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch(err) { }
  }

  onTextareaKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.generate();
    }
  }

  autoResize(): void {
    const textarea = this.promptTextarea?.nativeElement;
    if (!textarea) return;
    // Disable transition to prevent animated resize
    textarea.style.transition = 'none';
    // Collapse to 0 to get true scrollHeight
    textarea.style.height = '0px';
    const scrollH = textarea.scrollHeight;
    // Clamp between min 60px and max 300px
    textarea.style.height = Math.max(60, Math.min(scrollH, 300)) + 'px';
    // Show scrollbar only when content exceeds max
    textarea.style.overflowY = scrollH > 300 ? 'auto' : 'hidden';
  }

  private resetTextareaHeight(): void {
    const textarea = this.promptTextarea?.nativeElement;
    if (!textarea) return;
    textarea.style.transition = 'none';
    textarea.style.height = '60px';
    textarea.style.overflowY = 'hidden';
  }

  getActivatedSkills(msg: ChatMessage): string[] {
    if (!msg.toolResults) return [];
    
    const skills: string[] = [];
    for (const res of msg.toolResults) {
      if (res.tool === 'activate_skill') {
        const match = res.result.match(/name="([^"]*)"/);
        if (match) {
          skills.push(match[1]);
        }
      }
    }
    return Array.from(new Set(skills));
  }

  getContextFiles(): { [path: string]: string } | undefined {
    const data = this.visualEditorData();
    if (!data || !data.componentName) return undefined;

    const files = this.projectService.files();
    if (!files) return undefined;

    const componentName = data.componentName; 
    // Normalize: HeaderComponent -> header, but be careful not to match everything
    // If component is "HeaderComponent", we look for "header.component"
    let baseName = componentName.replace(/Component$/, '');
    baseName = baseName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(); // camelCase to kebab-case

    const contextFiles: { [path: string]: string } = {};
    
    const traverse = (node: any, currentPath: string) => {
      if (node.file) {
        // Strict check for component files: name.component.ts, name.component.html, name.component.scss
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

  async generate() {
    if (!this.prompt) return;

    // Add user message with snapshot
    this.messages.update(msgs => [...msgs, {
      role: 'user',
      text: this.prompt,
      timestamp: new Date(),
      files: this.projectService.files() 
    }]);

    let currentPrompt = this.prompt;
    this.prompt = '';
    this.resetTextareaHeight();
    this.loading.set(true);
    const generationStartTime = Date.now();

    if (this.attachedFileContent && this.attachedFile) {
      // Emitting event instead of calling onFileContentChange directly
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

    // Append Figma context if present (simplified to avoid token limits)
    if (this.figmaContext()) {
      const simplifiedContext = this.simplifyFigmaContext(this.figmaContext());
      currentPrompt += `

--- Figma Design Context ---
<figma_summary>
${simplifiedContext}
</figma_summary>

Analyze the attached design images carefully and create matching Angular components. The summary above provides structural hints.`;
    }

    // Append annotation context if the attached image is an annotated screenshot
    if (this.annotationContext) {
      currentPrompt += `

[Annotated Screenshot: The attached image is a screenshot of the user's live app with visual annotations drawn on top. The colored marks (arrows, rectangles, freehand strokes, text labels) are the user's annotations — NOT part of the actual app UI. ${this.annotationContext} Interpret these annotations as instructions for what the user wants changed in the code.]`;
      this.annotationContext = null;
    }

    // Placeholder for assistant
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

    // Override with manual selection if not auto
    const currentSelection = this.selectedModel();
    if (currentSelection.id !== 'auto') {
        provider = currentSelection.provider;
        model = currentSelection.id;
        // NOTE: We assume the user has configured the API Key for this provider in their profile
        // If they switch from Anthropic (profile default) to Gemini (manual), they must have a Gemini key saved in their profile/settings.
        // For now, we rely on the `appSettings` containing the keys globally or assuming the backend has them.
        // Ideally, we should look up the key for the specific provider from `appSettings` if available.
        if (this.appSettings?.profiles) {
           const profileForProvider = this.appSettings.profiles.find((p: any) => p.provider === provider);
           if (profileForProvider) {
               apiKey = profileForProvider.apiKey;
           }
        }
    } else if (this.appSettings?.smartRouting?.enabled) {
        model = 'auto';
    }
    // else: keep provider/model from active profile

    // Collect all images (attached file + Figma imports)
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
      smartRouting: this.appSettings?.smartRouting,
      openFiles: this.getContextFiles(),
      use_container_context: this.projectService.agentMode(),
      forcedSkill: this.selectedSkill()?.name,
      planMode: this.planMode()
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
            // Show "Generating..." status during text streaming so user knows AI is still working
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
           // Progressive streaming: trigger HMR update immediately
           this.hmrTrigger.triggerUpdate(event.path, event.content);
           this.progressiveStore.updateProgress(event.path, event.content, true);

           // Also update the file store for editor display
           this.projectService.fileStore.updateFile(event.path, event.content);
        } else if (event.type === 'file_progress') {
           // Progressive streaming: update store with partial content
           this.progressiveStore.updateProgress(event.path, event.content, event.isComplete);
        } else if (event.type === 'screenshot_request') {
           // AI requested a screenshot of the preview
           this.handleScreenshotRequest(event.requestId);
        } else if (event.type === 'question_request') {
           // AI requested user input via ask_user tool
           // Pre-populate answers with default values
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
            // Clear attachments
            this.attachedFileContent = null;
            this.attachedFile = null;
            this.annotationContext = null;
            // Clear Figma context
            this.figmaContext.set(null);
            this.figmaImages.set([]);

            const res = event.content;

            const current = this.projectService.files() || BASE_FILES;
            const projectFiles = this.projectService.mergeFiles(current, res.files);

            this.messages.update(msgs => {
              const newMsgs = [...msgs];
              newMsgs[assistantMsgIndex].files = projectFiles;
              newMsgs[assistantMsgIndex].model = res.model; // Capture the model actually used
              newMsgs[assistantMsgIndex].duration = Date.now() - generationStartTime;
              newMsgs[assistantMsgIndex].status = undefined; // Clear status on completion
              return newMsgs;
            });

            // Progressive streaming already handled HMR updates via file_written events
            // Just sync the final merged state to the file store without full reload
            this.projectService.fileStore.setFiles(projectFiles);
            this.loading.set(false);

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
        // Final clear of status
        this.messages.update(msgs => {
            const newMsgs = [...msgs];
            newMsgs[assistantMsgIndex].status = undefined;
            return newMsgs;
        });
        // Clear progressive streaming state
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

  /**
   * Handle screenshot request from the AI.
   * Captures the preview iframe and POSTs the image back to the server.
   */
  private async handleScreenshotRequest(requestId: string) {
    console.log('[Screenshot] Request received:', requestId);

    try {
      const imageData = await this.screenshotService.captureThumbnail();

      if (!imageData) {
        // Report error to server
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

      // Send screenshot to server
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
      // Try to notify server of error
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

  /**
   * Submit answers to a pending question request from the AI.
   */
  submitQuestionAnswers(msg: ChatMessage) {
    if (!msg.pendingQuestion) return;

    const { requestId, answers } = msg.pendingQuestion;

    // Reset keyboard focus
    this.resetQuestionKeyboardFocus();

    this.apiService.submitQuestionAnswers(requestId, answers).subscribe({
      next: (result) => {
        console.log('[Question] Answers submitted:', result);
        // Clear the pending question after submission
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

  /**
   * Cancel a pending question request.
   */
  cancelQuestion(msg: ChatMessage) {
    if (!msg.pendingQuestion) return;

    const { requestId } = msg.pendingQuestion;

    this.apiService.cancelQuestion(requestId).subscribe({
      next: (result) => {
        console.log('[Question] Request cancelled:', result);
        // Clear the pending question after cancellation
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

  /**
   * Update an answer for a pending question.
   */
  updateQuestionAnswer(msg: ChatMessage, questionId: string, value: any) {
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

  /**
   * Toggle a checkbox option for a question.
   */
  toggleCheckboxOption(msg: ChatMessage, questionId: string, optionValue: string) {
    if (!msg.pendingQuestion) return;

    const currentValue = msg.pendingQuestion.answers[questionId] || [];
    const newValue = currentValue.includes(optionValue)
      ? currentValue.filter((v: string) => v !== optionValue)
      : [...currentValue, optionValue];

    this.updateQuestionAnswer(msg, questionId, newValue);
  }

  /**
   * Check if a checkbox option is selected.
   */
  isCheckboxOptionSelected(msg: ChatMessage, questionId: string, optionValue: string): boolean {
    if (!msg.pendingQuestion) return false;
    const currentValue = msg.pendingQuestion.answers[questionId] || [];
    return currentValue.includes(optionValue);
  }

  /**
   * Check if all required questions have been answered.
   */
  canSubmitQuestions(msg: ChatMessage): boolean {
    if (!msg.pendingQuestion) return false;

    for (const q of msg.pendingQuestion.questions) {
      if (q.required) {
        const answer = msg.pendingQuestion.answers[q.id];
        if (answer === undefined || answer === null || answer === '' ||
            (Array.isArray(answer) && answer.length === 0)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Check if any questions have default values.
   */
  hasDefaultAnswers(msg: ChatMessage): boolean {
    if (!msg.pendingQuestion) return false;
    return msg.pendingQuestion.questions.some(q => q.default !== undefined);
  }

  /**
   * Accept all default values and submit.
   */
  acceptDefaults(msg: ChatMessage) {
    if (!msg.pendingQuestion) return;

    // Set all answers to their defaults
    const defaultAnswers: Record<string, any> = {};
    for (const q of msg.pendingQuestion.questions) {
      if (q.default !== undefined) {
        defaultAnswers[q.id] = q.default;
      }
    }

    // Update answers with defaults
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

    // Submit after a brief delay to allow UI to update
    setTimeout(() => {
      this.submitQuestionAnswers(msg);
    }, 50);
  }

  /**
   * Handle keyboard navigation in question panel.
   */
  onQuestionPanelKeydown(event: KeyboardEvent, msg: ChatMessage) {
    if (!msg.pendingQuestion) return;

    const questions = msg.pendingQuestion.questions;
    const currentQIndex = this.focusedQuestionIndex();
    const currentOIndex = this.focusedOptionIndex();

    // Ctrl/Cmd + Enter to submit
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (this.canSubmitQuestions(msg)) {
        this.submitQuestionAnswers(msg);
      }
      return;
    }

    // Ctrl/Cmd + D to accept defaults
    if (event.key === 'd' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (this.hasDefaultAnswers(msg)) {
        this.acceptDefaults(msg);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigateDown(questions, currentQIndex, currentOIndex);
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.navigateUp(questions, currentQIndex, currentOIndex);
        break;

      case 'ArrowRight':
      case 'Tab':
        if (!event.shiftKey) {
          // Move to next question
          if (currentQIndex < questions.length - 1) {
            event.preventDefault();
            this.focusedQuestionIndex.set(currentQIndex + 1);
            this.focusedOptionIndex.set(0);
          }
        }
        break;

      case 'ArrowLeft':
        // Move to previous question
        if (currentQIndex > 0) {
          event.preventDefault();
          this.focusedQuestionIndex.set(currentQIndex - 1);
          const prevQ = questions[currentQIndex - 1];
          if (prevQ.options) {
            this.focusedOptionIndex.set(0);
          } else {
            this.focusedOptionIndex.set(-1);
          }
        }
        break;

      case 'Enter':
      case ' ':
        // Select current option or submit if on button
        if (currentQIndex >= 0 && currentQIndex < questions.length) {
          const q = questions[currentQIndex];
          if (q.type === 'text') {
            // For text, Enter should not select - let it work naturally
            if (event.key === ' ') return; // Allow space in text
          } else if (q.options && currentOIndex >= 0 && currentOIndex < q.options.length) {
            event.preventDefault();
            const opt = q.options[currentOIndex];
            if (q.type === 'radio') {
              this.updateQuestionAnswer(msg, q.id, opt.value);
            } else if (q.type === 'checkbox') {
              this.toggleCheckboxOption(msg, q.id, opt.value);
            }
          }
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.cancelQuestion(msg);
        break;
    }
  }

  /**
   * Navigate down in the question panel.
   */
  private navigateDown(questions: Question[], qIndex: number, oIndex: number) {
    if (qIndex < 0) {
      // Start at first question
      this.focusedQuestionIndex.set(0);
      this.focusedOptionIndex.set(questions[0]?.options ? 0 : -1);
      return;
    }

    const currentQ = questions[qIndex];
    if (currentQ.options && oIndex < currentQ.options.length - 1) {
      // Move to next option in current question
      this.focusedOptionIndex.set(oIndex + 1);
    } else if (qIndex < questions.length - 1) {
      // Move to next question
      this.focusedQuestionIndex.set(qIndex + 1);
      this.focusedOptionIndex.set(questions[qIndex + 1]?.options ? 0 : -1);
    }
  }

  /**
   * Navigate up in the question panel.
   */
  private navigateUp(questions: Question[], qIndex: number, oIndex: number) {
    if (qIndex < 0) return;

    const currentQ = questions[qIndex];
    if (currentQ.options && oIndex > 0) {
      // Move to previous option in current question
      this.focusedOptionIndex.set(oIndex - 1);
    } else if (qIndex > 0) {
      // Move to previous question
      const prevQ = questions[qIndex - 1];
      this.focusedQuestionIndex.set(qIndex - 1);
      if (prevQ.options) {
        this.focusedOptionIndex.set(prevQ.options.length - 1);
      } else {
        this.focusedOptionIndex.set(-1);
      }
    }
  }

  /**
   * Initialize keyboard focus when question panel appears.
   */
  initQuestionKeyboardFocus(msg: ChatMessage) {
    if (!msg.pendingQuestion || msg.pendingQuestion.questions.length === 0) return;

    // Focus first question, first option
    this.focusedQuestionIndex.set(0);
    const firstQ = msg.pendingQuestion.questions[0];
    this.focusedOptionIndex.set(firstQ.options ? 0 : -1);
  }

  /**
   * Reset keyboard focus state.
   */
  resetQuestionKeyboardFocus() {
    this.focusedQuestionIndex.set(-1);
    this.focusedOptionIndex.set(-1);
  }

  /**
   * Check if an option is focused for keyboard navigation.
   */
  isOptionFocused(qIndex: number, oIndex: number): boolean {
    return this.focusedQuestionIndex() === qIndex && this.focusedOptionIndex() === oIndex;
  }

  /**
   * Check if a question's text input is focused.
   */
  isTextInputFocused(qIndex: number): boolean {
    return this.focusedQuestionIndex() === qIndex && this.focusedOptionIndex() === -1;
  }

  /**
   * Check if the uploaded image is a custom upload (not from predefined options).
   */
  isCustomUploadedImage(msg: ChatMessage, question: Question): boolean {
    if (!msg.pendingQuestion) return false;
    const answer = msg.pendingQuestion.answers[question.id];
    if (!answer) return false;
    // If there are no options, or the answer doesn't match any option value, it's a custom upload
    if (!question.options || question.options.length === 0) return true;
    return !question.options.find(o => o.value === answer);
  }

  /**
   * Handle image upload for image-type questions.
   * Reads the file and converts it to a data URL.
   */
  handleQuestionImageUpload(event: Event, msg: ChatMessage, questionId: string) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate it's an image
    if (!file.type.startsWith('image/')) {
      this.toastService.show('Please select an image file', 'error');
      return;
    }

    // Read the file as data URL
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        this.updateQuestionAnswer(msg, questionId, dataUrl);
      }
    };
    reader.onerror = () => {
      this.toastService.show('Failed to read image file', 'error');
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be selected again
    input.value = '';
  }

  /**
   * Get available project assets for image-type questions.
   * Returns image files from the public/assets directory.
   */
  getProjectImageAssets(): { path: string; name: string }[] {
    const files = this.projectService.files();
    if (!files) return [];

    const assets: { path: string; name: string }[] = [];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];

    const traverse = (node: any, currentPath: string) => {
      if (node.file) {
        const ext = currentPath.substring(currentPath.lastIndexOf('.')).toLowerCase();
        if (imageExtensions.includes(ext)) {
          // Extract filename from path
          const name = currentPath.split('/').pop() || currentPath;
          assets.push({ path: currentPath, name });
        }
      } else if (node.directory) {
        for (const key in node.directory) {
          traverse(node.directory[key], `${currentPath}${key}/`.replace('//', '/'));
        }
      }
    };

    // Start traversal from public/assets if it exists
    if (files['public']?.directory?.['assets']?.directory) {
      traverse({ directory: files['public'].directory['assets'].directory }, 'assets/');
    }

    return assets;
  }

  ngOnDestroy() {
    this.activeSubscription?.unsubscribe();
  }
}
