import { jsonrepair } from 'jsonrepair';
import { createHash } from 'crypto';

/**
 * Validates that required arguments are present for a tool call.
 * Returns an error message if validation fails, or null if valid.
 */
export function validateToolArgs(toolName: string, toolArgs: any, required: string[]): string | null {
  const missing = required.filter(key => toolArgs[key] === undefined || toolArgs[key] === null || toolArgs[key] === '');
  if (missing.length > 0) {
    return `Error: Tool '${toolName}' missing required arguments: ${missing.join(', ')}. Your response may have been truncated. Try breaking the task into smaller steps.`;
  }
  return null;
}

/**
 * Sanitizes file content from write_files tool calls.
 * Fixes double-escaping issues where LLMs serialize SCSS/CSS content with
 * escaped quotes and literal \n sequences instead of actual newlines.
 */
export function sanitizeFileContent(content: string, filePath: string): string {
  // Strip leading/trailing artifact quotes from double-escaping
  if (content.length > 2 && content.startsWith('"') && content.endsWith('"')) {
    const inner = content.slice(1, -1);
    if (inner.includes('\\n') || inner.includes('\\t')) {
      content = inner;
    }
  }

  // Fix literal \n sequences → actual newlines
  if (content.length > 50 && !content.includes('\n') && content.includes('\\n')) {
    console.warn(`[WriteFiles] Fixing escaped newlines in ${filePath} (${content.length} chars)`);
    content = content
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  return content;
}

/**
 * Try to parse a JSON string that LLMs sometimes send instead of a parsed object/array.
 * Uses jsonrepair to handle malformed JSON with trailing garbage.
 */
export function tryParseJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(jsonrepair(value));
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  return null;
}

/**
 * Compute a short content hash for staleness detection.
 */
export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Normalize curly quotes to straight quotes for fuzzy matching.
 */
export function normalizeQuotes(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

/**
 * Get the CDP agent URL for desktop-mode tools.
 */
export function getCdpAgentUrl(): string {
  const agentPort = process.env['ADORABLE_AGENT_PORT'] || '3334';
  return `http://localhost:${agentPort}`;
}

/**
 * Check if we're running in desktop mode (required for CDP/native tools).
 */
export function isDesktopMode(): boolean {
  return process.env['ADORABLE_DESKTOP_MODE'] === 'true';
}
