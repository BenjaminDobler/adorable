import { Component, input, output, signal } from '@angular/core';

export interface ContextPreviewTool {
  name: string;
  description: string;
  parameters: { name: string; type: string; description: string; required: boolean }[];
}

export interface ContextPreviewSkill {
  name: string;
  description: string;
}

export interface ContextPreviewData {
  systemPrompt: string;
  knowledgeBase: string;
  userMessage: string;
  history: { role: string; text: string }[];
  contextSummary: string | null;
  tools: ContextPreviewTool[];
  skills: ContextPreviewSkill[];
  estimatedTokens: {
    systemPrompt: number;
    knowledgeBase: number;
    userMessage: number;
    history: number;
    contextSummary: number;
    tools: number;
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
    tools: true,
    skills: true,
  });

  expandedTools = signal<Record<string, boolean>>({});

  toggle(section: string) {
    this.collapsed.update(s => ({ ...s, [section]: !s[section] }));
  }

  isCollapsed(section: string): boolean {
    return this.collapsed()[section] ?? false;
  }

  toggleTool(name: string) {
    this.expandedTools.update(s => ({ ...s, [name]: !s[name] }));
  }

  isToolExpanded(name: string): boolean {
    return this.expandedTools()[name] ?? false;
  }

  skillsText(): string {
    return (this.data().skills || []).map(s => `${s.name}: ${s.description}`).join('\n');
  }

  toolsText(): string {
    const tools = this.data().tools || [];
    return tools.map(t => {
      const params = t.parameters.map(p =>
        `  ${p.name}${p.required ? '*' : ''}: ${p.type} — ${p.description}`
      ).join('\n');
      return `${t.name}\n  ${t.description}${params ? '\n' + params : ''}`;
    }).join('\n\n');
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
      (d.history.length > 0 || d.contextSummary) ? `=== HISTORY ===\n${this.historyText()}` : null,
      d.tools?.length > 0 ? `=== TOOLS (${d.tools.length}) ===\n${this.toolsText()}` : null,
      d.skills?.length > 0 ? `=== SKILLS (${d.skills.length}) ===\n${d.skills.map(s => `- ${s.name}: ${s.description}`).join('\n')}` : null,
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
