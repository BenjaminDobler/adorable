import { Component, input, output, signal, viewChild, ElementRef, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SafeUrlPipe } from '../../../../shared/pipes/safe-url.pipe';
import { SlashCommandDropdownComponent } from './slash-command-dropdown.component';
import { SlashCommandItem } from '../../../../core/services/slash-commands';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [FormsModule, SafeUrlPipe, SlashCommandDropdownComponent],
  templateUrl: './chat-input.html',
  styleUrls: ['./chat-input.scss']
})
export class ChatInputComponent {
  private promptTextarea = viewChild<ElementRef>('promptTextarea');
  fileInput = viewChild<ElementRef>('fileInput');

  loading = input(false);
  prompt = input('');
  attachedFileContent = input<string | null>(null);
  attachedFile = input<File | null>(null);
  isAttachedImage = input(false);
  shouldAddToAssets = input(true);
  hasFigmaAttachment = input(false);
  figmaFrameCount = input(0);
  figmaImages = input<string[]>([]);
  planMode = input(false);
  compactMode = input(true);
  aiSettingsOpen = input(false);
  mcpToolsVisible = input(false);
  mcpToolsCount = input(0);
  allSlashCommands = input<SlashCommandItem[]>([]);
  availableModels = input<any[]>([]);

  generateRequested = output<void>();
  previewRequested = output<void>();
  cancelGeneration = output<void>();
  promptChange = output<string>();
  fileSelected = output<Event>();
  removeAttachment = output<void>();
  removeFigmaAttachment = output<void>();
  toggleAiSettings = output<MouseEvent>();
  togglePlanMode = output<void>();
  toggleCompactMode = output<void>();
  toggleMcpTools = output<void>();
  clearContext = output<void>();
  previewImage = output<string>();
  shouldAddToAssetsChange = output<boolean>();
  slashCommandSelected = output<SlashCommandItem>();
  modelSelected = output<any>();

  isDragging = signal(false);

  // Slash command dropdown state
  slashCommandVisible = signal(false);
  slashCommandActiveIndex = signal(0);
  dropdownMode = signal<'commands' | 'models'>('commands');

  slashCommandItems = computed(() => {
    if (this.dropdownMode() === 'models') {
      return this.availableModels().map((m: any) => ({
        id: `model:${m.id}`,
        type: 'model' as const,
        label: m.name || m.id,
        description: m.provider || '',
        data: m
      }));
    }
    return this._filteredCommands();
  });

  private _filteredCommands = signal<SlashCommandItem[]>([]);

  onTextareaKeydown(event: KeyboardEvent): void {
    if (this.slashCommandVisible()) {
      const items = this.slashCommandItems();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.slashCommandActiveIndex.update(i => (i + 1) % Math.max(items.length, 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.slashCommandActiveIndex.update(i => (i - 1 + items.length) % Math.max(items.length, 1));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const selected = items[this.slashCommandActiveIndex()];
        if (selected) this.selectCommand(selected);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.dismissDropdown();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.generateRequested.emit();
    }
  }

  onSendClick(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      this.previewRequested.emit();
    } else {
      this.generateRequested.emit();
    }
  }

  autoResize(): void {
    const textarea = this.promptTextarea()?.nativeElement;
    if (!textarea) return;
    textarea.style.transition = 'none';
    textarea.style.height = '0px';
    const scrollH = textarea.scrollHeight;
    textarea.style.height = Math.max(60, Math.min(scrollH, 300)) + 'px';
    textarea.style.overflowY = scrollH > 300 ? 'auto' : 'hidden';
  }

  resetTextareaHeight(): void {
    const textarea = this.promptTextarea()?.nativeElement;
    if (!textarea) return;
    textarea.style.transition = 'none';
    textarea.style.height = '60px';
    textarea.style.overflowY = 'hidden';
  }

  focusAndResize(): void {
    setTimeout(() => {
      const textarea = this.promptTextarea()?.nativeElement;
      if (textarea) {
        textarea.focus();
        this.autoResize();
      }
    }, 0);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      const syntheticEvent = { target: { files: dt.files } };
      this.fileSelected.emit(syntheticEvent as any);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onPromptInput(value: string) {
    this.promptChange.emit(value);
    this.autoResize();

    // Slash command detection: only trigger when "/" is at position 0
    if (value.startsWith('/')) {
      const query = value.substring(1);
      const filtered = this.allSlashCommands().filter(cmd =>
        cmd.label.toLowerCase().startsWith('/' + query.toLowerCase())
      );
      this._filteredCommands.set(filtered);
      this.slashCommandActiveIndex.set(0);
      this.dropdownMode.set('commands');
      this.slashCommandVisible.set(filtered.length > 0 || query.length === 0);
    } else {
      this.dismissDropdown();
    }
  }

  selectCommand(item: SlashCommandItem) {
    if (item.type === 'action' && item.id === 'model') {
      // Drill down into model list
      this.dropdownMode.set('models');
      this.slashCommandActiveIndex.set(0);
      return;
    }

    if (this.dropdownMode() === 'models') {
      this.promptChange.emit('');
      this.resetTextareaHeight();
      this.dismissDropdown();
      this.modelSelected.emit(item.data);
      return;
    }

    this.promptChange.emit('');
    this.resetTextareaHeight();
    this.dismissDropdown();
    this.slashCommandSelected.emit(item);
  }

  dismissDropdown() {
    this.slashCommandVisible.set(false);
    this.slashCommandActiveIndex.set(0);
    this.dropdownMode.set('commands');
  }
}
