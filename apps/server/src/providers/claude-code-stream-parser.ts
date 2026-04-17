import * as fs from 'fs';
import * as path from 'path';
import { StreamCallbacks, TokenUsage } from './types';

/**
 * Parses Claude Code CLI's `--output-format stream-json` JSONL output
 * and translates events into Adorable's StreamCallbacks.
 *
 * Claude Code emits newline-delimited JSON objects with these types:
 * - system (subtype: init) — session metadata
 * - assistant — message with text/tool_use content blocks
 * - user — message with tool_result content blocks
 * - result — final usage stats and session info
 */
export class ClaudeCodeStreamParser {
  private buffer = '';
  private sessionId: string | null = null;
  private toolIndex = 0;
  private modifiedFiles: string[] = [];
  private fullExplanation = '';

  /**
   * Maps tool_use IDs to pending file write info.
   * When we see a Write/Edit tool_use, we record the path.
   * When the tool_result arrives, we read the file from disk and fire onFileWritten.
   */
  private pendingWrites = new Map<string, { path: string; toolName: string }>();

  /**
   * Maps tool_use IDs to tool names (for tool_result translation).
   */
  private toolNames = new Map<string, string>();

  constructor(
    private callbacks: StreamCallbacks,
    private projectPath: string
  ) {}

  /**
   * Feed raw stdout data from the claude CLI process.
   * Splits by newlines and processes each complete JSON line.
   */
  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed);
        this.handleEvent(event);
      } catch {
        // Skip malformed lines (e.g. stderr leakage)
      }
    }
  }

  /**
   * Flush any remaining buffer content (call on process exit).
   */
  flush(): void {
    if (this.buffer.trim()) {
      try {
        const event = JSON.parse(this.buffer.trim());
        this.handleEvent(event);
      } catch {
        // Ignore
      }
      this.buffer = '';
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getModifiedFiles(): string[] {
    return [...this.modifiedFiles];
  }

  getExplanation(): string {
    return this.fullExplanation;
  }

  private handleEvent(event: any): void {
    const type = event.type;

    if (type === 'system') {
      this.handleSystemEvent(event);
    } else if (type === 'assistant') {
      this.handleAssistantEvent(event);
    } else if (type === 'user') {
      this.handleUserEvent(event);
    } else if (type === 'result') {
      this.handleResultEvent(event);
    }
    // Ignore unknown event types (e.g. content_block_delta for streaming)
  }

  private handleSystemEvent(event: any): void {
    // system.init carries session_id
    if (event.subtype === 'init' && event.session_id) {
      this.sessionId = event.session_id;
    }
  }

  private handleAssistantEvent(event: any): void {
    const message = event.message;
    if (!message?.content) return;

    for (const block of message.content) {
      if (block.type === 'text') {
        this.handleTextBlock(block);
      } else if (block.type === 'tool_use') {
        this.handleToolUseBlock(block);
      }
    }
  }

  private handleTextBlock(block: any): void {
    const text = block.text || '';
    if (text) {
      this.fullExplanation += text;
      this.callbacks.onText?.(text);
    }
  }

  private handleToolUseBlock(block: any): void {
    const { id, name, input } = block;
    const index = this.toolIndex++;

    // Record tool name for result mapping
    this.toolNames.set(id, name);

    // Translate Claude Code tool names to Adorable tool names for display
    const adorableName = this.translateToolName(name);
    const activityDesc = this.getActivityDescription(name, input);

    this.callbacks.onToolCall?.(index, adorableName, input, activityDesc);

    // Track file writes for onFileWritten callbacks
    if (this.isFileWriteTool(name)) {
      const filePath = this.extractFilePath(name, input);
      if (filePath) {
        this.pendingWrites.set(id, { path: filePath, toolName: name });

        // For Write tool, we have the content directly in the input
        if (name === 'Write' && input?.content) {
          // Fire onFileWritten immediately with the content from the tool input
          const relativePath = this.toRelativePath(filePath);
          this.callbacks.onFileWritten?.(relativePath, input.content);
          if (!this.modifiedFiles.includes(relativePath)) {
            this.modifiedFiles.push(relativePath);
          }
          // Remove from pending — we already handled it
          this.pendingWrites.delete(id);
        }
      }
    }
  }

  private handleUserEvent(event: any): void {
    const message = event.message;
    if (!message?.content) return;

    for (const block of message.content) {
      if (block.type === 'tool_result') {
        this.handleToolResultBlock(block);
      }
    }
  }

  private handleToolResultBlock(block: any): void {
    const { tool_use_id, content, is_error } = block;
    const toolName = this.toolNames.get(tool_use_id);

    // Extract text content from tool result
    const resultText = this.extractToolResultText(content);

    this.callbacks.onToolResult?.(tool_use_id, resultText, toolName);

    // Handle pending file writes (Edit tool — content not in input)
    const pending = this.pendingWrites.get(tool_use_id);
    if (pending && !is_error) {
      this.handleFileWriteResult(pending.path, pending.toolName);
      this.pendingWrites.delete(tool_use_id);
    }
  }

  private handleResultEvent(event: any): void {
    // Extract token usage
    const usage = event.usage;
    if (usage) {
      const tokenUsage: TokenUsage = {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        cacheCreationInputTokens: usage.cache_creation_input_tokens,
        cacheReadInputTokens: usage.cache_read_input_tokens,
      };
      this.callbacks.onTokenUsage?.(tokenUsage);
    }

    // Also capture session_id from result if not yet set
    if (!this.sessionId && event.session_id) {
      this.sessionId = event.session_id;
    }
  }

  /**
   * After a successful Edit/Write tool_result, read the file from disk
   * and fire onFileWritten.
   */
  private handleFileWriteResult(filePath: string, toolName: string): void {
    const relativePath = this.toRelativePath(filePath);
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.projectPath, filePath);
      const content = fs.readFileSync(absolutePath, 'utf-8');
      this.callbacks.onFileWritten?.(relativePath, content);
      if (!this.modifiedFiles.includes(relativePath)) {
        this.modifiedFiles.push(relativePath);
      }
    } catch {
      // File may not exist yet or read failed — skip onFileWritten
    }
  }

  /**
   * Check if the tool name indicates a file write/edit.
   */
  private isFileWriteTool(name: string): boolean {
    return ['Write', 'Edit', 'MultiEdit'].includes(name);
  }

  /**
   * Extract the file path from a Write/Edit tool's input.
   */
  private extractFilePath(toolName: string, input: any): string | null {
    if (!input) return null;
    // Claude Code tools use file_path
    return input.file_path || input.path || null;
  }

  /**
   * Translate Claude Code tool names to Adorable equivalents for UI display.
   */
  private translateToolName(name: string): string {
    const map: Record<string, string> = {
      'Write': 'write_file',
      'Edit': 'edit_file',
      'MultiEdit': 'patch_files',
      'Read': 'read_file',
      'Bash': 'run_command',
      'Grep': 'grep',
      'Glob': 'glob',
    };
    return map[name] || name;
  }

  /**
   * Generate a human-readable activity description for a tool call.
   */
  private getActivityDescription(name: string, input: any): string {
    const filePath = input?.file_path || input?.path || '';
    switch (name) {
      case 'Write':
        return filePath ? `Writing ${filePath}` : 'Writing file';
      case 'Edit':
      case 'MultiEdit':
        return filePath ? `Editing ${filePath}` : 'Editing file';
      case 'Read':
        return filePath ? `Reading ${filePath}` : 'Reading file';
      case 'Bash':
        return input?.command ? `Running: ${input.command.substring(0, 60)}` : 'Running command';
      case 'Grep':
        return input?.pattern ? `Searching for "${input.pattern}"` : 'Searching';
      case 'Glob':
        return input?.pattern ? `Finding files: ${input.pattern}` : 'Finding files';
      default:
        // MCP tools (adorable__browse_screenshot, etc.)
        if (name.startsWith('mcp__adorable__')) {
          const mcpName = name.replace('mcp__adorable__', '');
          return this.getMCPToolDescription(mcpName, input);
        }
        return `Running ${name}`;
    }
  }

  private getMCPToolDescription(name: string, input: any): string {
    if (name.startsWith('browse_')) return 'Inspecting preview';
    if (name.startsWith('inspect_')) return 'Inspecting component';
    if (name.startsWith('figma_')) return 'Accessing Figma';
    if (name === 'measure_element') return 'Measuring element';
    if (name === 'verify_build') return 'Verifying build';
    if (name === 'activate_skill') return `Activating skill: ${input?.name || ''}`;
    return `Running ${name}`;
  }

  /**
   * Extract text content from a tool_result content field.
   * Content can be a string, array of content blocks, or undefined.
   */
  private extractToolResultText(content: any): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text || '')
        .join('\n');
    }
    return String(content);
  }

  /**
   * Convert an absolute path to a project-relative path.
   */
  private toRelativePath(filePath: string): string {
    if (path.isAbsolute(filePath) && filePath.startsWith(this.projectPath)) {
      return path.relative(this.projectPath, filePath);
    }
    return filePath;
  }
}
