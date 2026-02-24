import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatMessage } from '../../services/project';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { QuestionPanelComponent } from '../question-panel/question-panel.component';

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [CommonModule, MarkdownPipe, QuestionPanelComponent],
  templateUrl: './chat-message-list.html',
  styleUrls: ['./chat-message-list.scss']
})
export class ChatMessageListComponent {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  @Input() messages: ChatMessage[] = [];
  @Input() loading = false;
  @Input() compactMode = true;
  @Input() quickStarters: { label: string; description: string; prompt: string }[] = [];
  @Input() buildError: string | null = null;
  @Input() projectImageAssets: { path: string; name: string }[] = [];

  @Output() restoreVersion = new EventEmitter<any>();
  @Output() useQuickStarter = new EventEmitter<string>();
  @Output() autoRepair = new EventEmitter<string>();
  @Output() dismissError = new EventEmitter<void>();

  // Question panel pass-through events
  @Output() questionSubmitted = new EventEmitter<ChatMessage>();
  @Output() questionCancelled = new EventEmitter<ChatMessage>();
  @Output() questionAnswerUpdated = new EventEmitter<{ msg: ChatMessage; questionId: string; value: any }>();
  @Output() questionCheckboxToggled = new EventEmitter<{ msg: ChatMessage; questionId: string; optionValue: string }>();
  @Output() questionDefaultsAccepted = new EventEmitter<ChatMessage>();

  private isUserAtBottom = true;

  onScroll(): void {
    if (!this.scrollContainer) return;
    const el = this.scrollContainer.nativeElement;
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

  checkAutoScroll(): void {
    if (this.isUserAtBottom) {
      setTimeout(() => this.scrollToBottom(), 0);
    }
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
}
