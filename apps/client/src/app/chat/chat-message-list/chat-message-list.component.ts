import { Component, input, output, viewChild, ElementRef } from '@angular/core';
import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { ChatMessage } from '../../services/project';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { QuestionPanelComponent } from '../question-panel/question-panel.component';

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [DatePipe, DecimalPipe, UpperCasePipe, MarkdownPipe, QuestionPanelComponent],
  templateUrl: './chat-message-list.html',
  styleUrls: ['./chat-message-list.scss']
})
export class ChatMessageListComponent {
  private scrollContainer = viewChild<ElementRef>('scrollContainer');

  messages = input<ChatMessage[]>([]);
  loading = input(false);
  compactMode = input(true);
  quickStarters = input<{ label: string; description: string; prompt: string }[]>([]);
  buildError = input<string | null>(null);
  projectImageAssets = input<{ path: string; name: string }[]>([]);

  restoreVersion = output<any>();
  useQuickStarter = output<string>();
  autoRepair = output<string>();
  dismissError = output<void>();

  // Question panel pass-through events
  questionSubmitted = output<ChatMessage>();
  questionCancelled = output<ChatMessage>();
  questionAnswerUpdated = output<{ msg: ChatMessage; questionId: string; value: any }>();
  questionCheckboxToggled = output<{ msg: ChatMessage; questionId: string; optionValue: string }>();
  questionDefaultsAccepted = output<ChatMessage>();

  private isUserAtBottom = true;

  onScroll(): void {
    const container = this.scrollContainer();
    if (!container) return;
    const el = container.nativeElement;
    const threshold = 100;
    this.isUserAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  scrollToBottom(): void {
    try {
      const container = this.scrollContainer();
      if (container) {
        container.nativeElement.scrollTop = container.nativeElement.scrollHeight;
      }
    } catch(err) { }
  }

  checkAutoScroll(): void {
    if (this.isUserAtBottom) {
      setTimeout(() => this.scrollToBottom(), 0);
    }
  }

  getUsageTooltip(msg: ChatMessage): string {
    if (!msg.usage) return '';
    const lines: string[] = [
      `Input: ${msg.usage.inputTokens.toLocaleString()} tokens`,
      `Output: ${msg.usage.outputTokens.toLocaleString()} tokens`,
    ];
    if (msg.usage.cacheCreationInputTokens) {
      lines.push(`Cache write: ${msg.usage.cacheCreationInputTokens.toLocaleString()} tokens`);
    }
    if (msg.usage.cacheReadInputTokens) {
      lines.push(`Cache read: ${msg.usage.cacheReadInputTokens.toLocaleString()} tokens`);
    }
    if (msg.usage.cost) {
      lines.push('');
      lines.push(`Input cost: $${msg.usage.cost.inputCost.toFixed(4)}`);
      lines.push(`Output cost: $${msg.usage.cost.outputCost.toFixed(4)}`);
      if (msg.usage.cost.cacheCreationCost > 0) {
        lines.push(`Cache write cost: $${msg.usage.cost.cacheCreationCost.toFixed(4)}`);
      }
      if (msg.usage.cost.cacheReadCost > 0) {
        lines.push(`Cache read cost: $${msg.usage.cost.cacheReadCost.toFixed(4)}`);
      }
      lines.push(`Total: $${msg.usage.cost.totalCost.toFixed(4)}`);
    }
    return lines.join('\n');
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
