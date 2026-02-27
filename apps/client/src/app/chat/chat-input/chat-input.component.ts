import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SafeUrlPipe } from '../../pipes/safe-url.pipe';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule, SafeUrlPipe],
  templateUrl: './chat-input.html',
  styleUrls: ['./chat-input.scss']
})
export class ChatInputComponent {
  @ViewChild('promptTextarea') private promptTextarea!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;

  @Input() loading = false;
  @Input() prompt = '';
  @Input() attachedFileContent: string | null = null;
  @Input() attachedFile: File | null = null;
  @Input() isAttachedImage = false;
  @Input() shouldAddToAssets = true;
  @Input() hasFigmaAttachment = false;
  @Input() figmaFrameCount = 0;
  @Input() figmaImages: string[] = [];
  @Input() planMode = false;
  @Input() compactMode = true;
  @Input() aiSettingsOpen = false;
  @Input() mcpToolsVisible = false;
  @Input() mcpToolsCount = 0;
  @Output() generateRequested = new EventEmitter<void>();
  @Output() cancelGeneration = new EventEmitter<void>();
  @Output() promptChange = new EventEmitter<string>();
  @Output() fileSelected = new EventEmitter<Event>();
  @Output() removeAttachment = new EventEmitter<void>();
  @Output() removeFigmaAttachment = new EventEmitter<void>();
  @Output() toggleAiSettings = new EventEmitter<MouseEvent>();
  @Output() togglePlanMode = new EventEmitter<void>();
  @Output() toggleCompactMode = new EventEmitter<void>();
  @Output() toggleMcpTools = new EventEmitter<void>();
  @Output() clearContext = new EventEmitter<void>();
  @Output() previewImage = new EventEmitter<string>();
  @Output() shouldAddToAssetsChange = new EventEmitter<boolean>();

  isDragging = false;

  onTextareaKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.generateRequested.emit();
    }
  }

  autoResize(): void {
    const textarea = this.promptTextarea?.nativeElement;
    if (!textarea) return;
    textarea.style.transition = 'none';
    textarea.style.height = '0px';
    const scrollH = textarea.scrollHeight;
    textarea.style.height = Math.max(60, Math.min(scrollH, 300)) + 'px';
    textarea.style.overflowY = scrollH > 300 ? 'auto' : 'hidden';
  }

  resetTextareaHeight(): void {
    const textarea = this.promptTextarea?.nativeElement;
    if (!textarea) return;
    textarea.style.transition = 'none';
    textarea.style.height = '60px';
    textarea.style.overflowY = 'hidden';
  }

  focusAndResize(): void {
    setTimeout(() => {
      const textarea = this.promptTextarea?.nativeElement;
      if (textarea) {
        textarea.focus();
        this.autoResize();
      }
    }, 0);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files[0];
    if (file) {
      // Create a synthetic event to pass the file
      const dt = new DataTransfer();
      dt.items.add(file);
      const syntheticEvent = { target: { files: dt.files } };
      this.fileSelected.emit(syntheticEvent as any);
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

  onPromptInput(value: string) {
    this.promptChange.emit(value);
    this.autoResize();
  }
}
