import { Component, inject, signal, ElementRef, ViewChild, Output, EventEmitter, Input, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService, ChatMessage } from '../services/project';
import { ContainerEngine } from '../services/container-engine';
import { ApiService } from '../services/api';
import { ToastService } from '../services/toast';
import { TemplateService } from '../services/template';
import { SkillsService, Skill } from '../services/skills';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { BASE_FILES } from '../base-project';
import { FigmaImportPayload } from '@adorable/shared-types';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, SafeUrlPipe],
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss']
})
export class ChatComponent {
  private apiService = inject(ApiService);
  public webContainerService = inject(ContainerEngine);
  public projectService = inject(ProjectService);
  private toastService = inject(ToastService);
  private templateService = inject(TemplateService);
  private skillsService = inject(SkillsService);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;

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
  
  // Agent Mode State
  agentMode = signal(false);
  compactMode = signal(true); // Default to compact
  isDockerMode = computed(() => this.webContainerService.mode() === 'local');
  
  shouldAddToAssets = signal(true);
  attachedFile: File | null = null;
  attachedFileContent: string | null = null;
  isDragging = false;

  availableModels = signal<any[]>([
    { id: 'auto', name: '✨ Auto (Smart)', provider: 'auto' }
  ]);

  selectedModel = signal(this.availableModels()[0]);

  availableSkills = signal<Skill[]>([]);
  selectedSkill = signal<Skill | null>(null);

  // Figma import state
  figmaContext = signal<any>(null);
  figmaImages = signal<string[]>([]);

  get isAttachedImage(): boolean {
    return this.attachedFile?.type.startsWith('image/') ?? false;
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
        // Auto-scroll when messages change
        this.messages();
        setTimeout(() => this.scrollToBottom(), 0);
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

    // Disable agent mode if switching away from Docker
    effect(() => {
       if (!this.isDockerMode()) {
          this.agentMode.set(false);
       }
    });
  }

  loadSkills() {
    this.skillsService.getSkills().subscribe({
      next: (skills) => this.availableSkills.set(skills),
      error: () => console.warn('Failed to load skills for chat')
    });
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
        const textarea = document.querySelector('.input-container textarea');
        if (textarea) (textarea as HTMLElement).focus();
    }, 0);
  }

  setImage(image: string) {
    this.attachedFileContent = image;
    this.isDragging = false;
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

    this.prompt = `Visual Edit Request:
    Target Element: <${data.tagName}> class="${data.classes}"
    Original Text: "${data.text}"
    ${specificContext}

    Instruction: ${prompt}`;

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
    if (confirm('Are you sure you want to restore this version? Current unsaved changes might be lost.')) {
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

    // Focus the textarea
    setTimeout(() => {
      const textarea = document.querySelector('.input-container textarea');
      if (textarea) (textarea as HTMLElement).focus();
    }, 0);
  }

  scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch(err) { }
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
    this.loading.set(true);

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
    } else {
        model = 'auto';
    }

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

    this.apiService.generateStream(currentPrompt, previousFiles, {
      provider,
      apiKey,
      model,
      images: allImages.length > 0 ? allImages : undefined,
      smartRouting: this.appSettings?.smartRouting,
      openFiles: this.getContextFiles(),
      use_container_context: this.agentMode(),
      forcedSkill: this.selectedSkill()?.name
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
            // Clear status when text is streaming (usually means tool is done or explanation is happening)
            // But if we want to show 'Thinking...' we could.
            // For now, let's leave status if it was set, or maybe clear it?
            // If we clear it, 'Using tool...' flickers.
            // Let's clear status only if it was a generic 'Using tool...' and we are now getting text.
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
        } else if (event.type === 'result') {
          hasResult = true;
          try {
            // Clear attachments
            this.attachedFileContent = null;
            this.attachedFile = null;
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
              newMsgs[assistantMsgIndex].status = undefined; // Clear status on completion
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
        // Final clear of status
        this.messages.update(msgs => {
            const newMsgs = [...msgs];
            newMsgs[assistantMsgIndex].status = undefined;
            return newMsgs;
        });
      }
    });
  }
}
