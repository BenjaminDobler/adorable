import { Component, input, output, signal } from '@angular/core';

export interface ContextPreviewData {
  systemPrompt: string;
  knowledgeBase: string;
  userMessage: string;
  history: { role: string; text: string }[];
  contextSummary: string | null;
  estimatedTokens: {
    systemPrompt: number;
    knowledgeBase: number;
    userMessage: number;
    history: number;
    contextSummary: number;
    total: number;
  };
}

@Component({
  selector: 'app-context-preview-modal',
  standalone: true,
  imports: [],
  templateUrl: './context-preview-modal.html',
  styleUrls: ['./context-preview-modal.scss']
})
export class ContextPreviewModalComponent {
  data = input.required<ContextPreviewData>();
  closed = output<void>();

  // Start with userMessage expanded, everything else collapsed
  collapsed = signal<Record<string, boolean>>({
    systemPrompt: true,
    knowledgeBase: true,
    userMessage: false,
    history: true,
  });

  toggle(section: string) {
    this.collapsed.update(s => ({ ...s, [section]: !s[section] }));
  }

  isCollapsed(section: string): boolean {
    return this.collapsed()[section] ?? false;
  }

  async copySection(text: string) {
    await navigator.clipboard.writeText(text);
  }

  async copyAll() {
    const d = this.data();
    const all = [
      `=== SYSTEM PROMPT ===\n${d.systemPrompt}`,
      `=== KNOWLEDGE BASE ===\n${d.knowledgeBase}`,
      `=== USER MESSAGE ===\n${d.userMessage}`,
      d.history.length ? `=== HISTORY ===\n${this.historyText()}` : null,
    ].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(all);
  }

  formatTokens(n: number): string {
    return n >= 1000 ? `~${(n / 1000).toFixed(1)}k` : `~${n}`;
  }

  historyText(): string {
    const d = this.data();
    const parts: string[] = [];
    if (d.contextSummary) parts.push(`[Summary]: ${d.contextSummary}`);
    d.history.forEach(m => parts.push(`[${m.role}]: ${m.text}`));
    return parts.join('\n\n');
  }
}
