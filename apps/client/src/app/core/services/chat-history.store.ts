import { Injectable, signal } from '@angular/core';

// ─── Public types ──────────────────────────────────────────────────
// Kept here (rather than in project.ts) so chat-only consumers can import
// without dragging in the full ProjectService.

export interface QuestionOption {
  value: string;
  label: string;
  recommended?: boolean;
  preview?: string; // For image type: URL or path to preview
}

export interface Question {
  id: string;
  text: string;
  type: 'radio' | 'checkbox' | 'text' | 'color' | 'range' | 'image' | 'code';
  options?: QuestionOption[];
  placeholder?: string;
  required?: boolean;
  default?: string | string[] | number;
  // Range-type properties
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // Code-type properties
  language?: string;
  // Image-type properties
  allowUpload?: boolean;
}

export interface PendingQuestion {
  requestId: string;
  questions: Question[];
  context?: string;
  answers: Record<string, any>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  files?: any;
  commitSha?: string; // Git commit SHA for version restore
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    cost?: {
      inputCost: number;
      outputCost: number;
      cacheCreationCost: number;
      cacheReadCost: number;
      totalCost: number;
      subscription?: boolean;
    };
  };
  status?: string;
  model?: string;
  updatedFiles?: string[];
  toolResults?: { tool: string; result: string; isError?: boolean }[];
  duration?: number; // milliseconds
  isExpanded?: boolean; // For files
  areToolsExpanded?: boolean; // For tool results
  pendingQuestion?: PendingQuestion; // For ask_user tool
}

const INITIAL_GREETING: ChatMessage = {
  role: 'assistant',
  text: 'Hi! I can help you build an Angular app. Describe what you want to create.',
  timestamp: new Date(),
};

/**
 * Owns chat-message state for the current project: the message list shown in
 * the chat panel and the debug log buffer.
 *
 * Decoupled from ProjectService so chat-only consumers (chat.component,
 * versions-panel, etc.) can inject this store directly without pulling in
 * project-lifecycle, container-engine, kit-management, and publishing
 * concerns. ProjectService still re-exposes the signals and helpers via
 * delegation so existing call sites keep working unchanged.
 */
@Injectable({ providedIn: 'root' })
export class ChatHistoryStore {
  /** The visible chat thread for the current project. */
  readonly messages = signal<ChatMessage[]>([INITIAL_GREETING]);

  /** Free-form debug events emitted by the agent loop (tool calls, status, etc). */
  readonly debugLogs = signal<any[]>([]);

  /** Replace the entire message list (used when loading an existing project). */
  setMessages(messages: ChatMessage[]): void {
    this.messages.set(messages);
  }

  /** Reset to the empty state shown for a fresh project. */
  reset(): void {
    this.messages.set([INITIAL_GREETING]);
    this.debugLogs.set([]);
  }

  /** Clear messages without restoring the greeting (used when a saved project has no history yet). */
  clear(): void {
    this.messages.set([]);
  }

  addSystemMessage(text: string): void {
    this.messages.update((msgs) => [
      ...msgs,
      { role: 'system', text, timestamp: new Date() },
    ]);
  }

  addAssistantMessage(text: string): void {
    this.messages.update((msgs) => [
      ...msgs,
      { role: 'assistant', text, timestamp: new Date() },
    ]);
  }
}
