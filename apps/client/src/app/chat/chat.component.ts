import { Component, inject, signal, ElementRef, ViewChild, Output, EventEmitter, Input, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService, ChatMessage } from '../services/project';
import { WebContainerService } from '../services/web-container';
import { ApiService } from '../services/api';
import { ToastService } from '../services/toast';
import { TemplateService } from '../services/template';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { BASE_FILES } from '../base-project';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, SafeUrlPipe],
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss']
})
export class ChatComponent {
  private apiService = inject(ApiService);
  public webContainerService = inject(WebContainerService);
  public projectService = inject(ProjectService);
  private toastService = inject(ToastService);
  private templateService = inject(TemplateService);

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

  @Output() startSelection = new EventEmitter<void>();
  @Output() fileUploaded = new EventEmitter<{name: string, content: string}>();
  @Output() closeVisualEdit = new EventEmitter<void>();

  messages = this.projectService.messages;
  loading = this.projectService.loading;
  
  prompt = '';
  visualPrompt = '';
  
  // Visual Edit State
  editText = '';
  editColor = '#000000';
  
  shouldAddToAssets = signal(true);
  attachedFile: File | null = null;
  attachedFileContent: string | null = null;
  isDragging = false;

  availableModels = signal<any[]>([
    { id: 'auto', name: '✨ Auto (Smart)', provider: 'auto' }
  ]);

  selectedModel = signal(this.availableModels()[0]);

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
    effect(() => {
        // Auto-scroll when messages change
        this.messages();
        setTimeout(() => this.scrollToBottom(), 0);
    });
    
    effect(() => {
       const data = this.visualEditorData();
       if (data) {
          this.editText = data.text || '';
          this.editColor = data.styles?.color || '#000000';
       }
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

  scrollToBottom(): void {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch(err) { }
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

    this.apiService.generateStream(currentPrompt, previousFiles, {
      provider,
      apiKey,
      model,
      images: this.attachedFileContent ? [this.attachedFileContent] : undefined,
      smartRouting: this.appSettings?.smartRouting,
      openFiles: this.getContextFiles()
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
        } else if (event.type === 'usage') {
           this.messages.update(msgs => {
             const newMsgs = [...msgs];
             newMsgs[assistantMsgIndex].usage = event.usage;
             return newMsgs;
           });
        } else if (event.type === 'result') {
          hasResult = true;
          try {
            this.attachedFileContent = null;
            this.attachedFile = null;
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