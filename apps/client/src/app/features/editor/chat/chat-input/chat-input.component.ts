import { Component, input, output, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SafeUrlPipe } from '../../../../shared/pipes/safe-url.pipe';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [FormsModule, SafeUrlPipe],
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

  isDragging = signal(false);

  onTextareaKeydown(event: KeyboardEvent): void {
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
  }
}
