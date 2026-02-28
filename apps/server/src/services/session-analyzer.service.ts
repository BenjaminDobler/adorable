import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionOverview, SessionLogEntry, SessionSuggestion } from '@adorable/shared-types';

interface LogEvent {
  timestamp: string;
  type: string;
  data: any;
}

interface SessionMetrics {
  provider: string;
  model: string;
  turns: number;
  promptSummary: string;
  kitName?: string;
  buildAttempts: number;
  buildSuccesses: number;
  buildFailures: number;
  toolCallCount: number;
  errorCount: number;
  toolCallsByName: Record<string, number>;
  fileChurn: Record<string, number>;
  kitDocsRead: boolean;
  timestamp: string;
}

function getLogDir(): string {
  if (process.env['ADORABLE_DESKTOP_MODE'] === 'true') {
    const baseDir = process.env['ADORABLE_PROJECTS_DIR']
      ? path.resolve(process.env['ADORABLE_PROJECTS_DIR'], '..')
      : path.join(os.homedir(), '.adorable');
    return path.join(baseDir, 'debug_logs');
  }
  return path.resolve(process.cwd(), 'debug_logs');
}

class SessionAnalyzerService {
  async listSessions(projectId?: string): Promise<SessionLogEntry[]> {
    const logDir = getLogDir();
    let filenames: string[];

    try {
      filenames = await fs.readdir(logDir);
    } catch {
      return [];
    }

    filenames = filenames
      .filter(f => f.endsWith('.jsonl'))
      .filter(f => !projectId || f.includes(`_trace_${projectId}_`));

    // Sort by modification time desc
    const withStats = await Promise.all(
      filenames.map(async f => {
        try {
          const stat = await fs.stat(path.join(logDir, f));
          return { filename: f, mtime: stat.mtimeMs };
        } catch {
          return null;
        }
      })
    );

    const sorted = withStats
      .filter(Boolean)
      .sort((a, b) => b!.mtime - a!.mtime)
      .slice(0, 20) as { filename: string; mtime: number }[];

    const sessions: SessionLogEntry[] = [];

    for (const { filename } of sorted) {
      try {
        const overview = await this.getQuickOverview(path.join(logDir, filename));
        if (!overview) continue;

        // Extract projectId from filename pattern: provider_trace_projectId_timestamp.jsonl
        const match = filename.match(/_trace_([^_]+)_/);

        sessions.push({
          filename,
          projectId: match?.[1],
          provider: overview.provider,
          timestamp: overview.timestamp,
          overview,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return sessions;
  }

  private async getQuickOverview(filePath: string): Promise<SessionOverview | null> {
    // Read first ~50 lines to get INIT, START, and first USER_MESSAGE
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean).slice(0, 100);

    let provider = 'unknown';
    let model = 'unknown';
    let timestamp = '';
    let promptSummary = '';
    let kitName: string | undefined;
    let turns = 0;
    let toolCallCount = 0;
    let errorCount = 0;
    let buildAttempts = 0;
    let buildSuccesses = 0;
    let buildFailures = 0;

    // For full counts, scan all lines
    const allLines = content.split('\n').filter(Boolean);

    for (const line of allLines) {
      try {
        const event: LogEvent = JSON.parse(line);

        if (event.type === 'INIT') {
          provider = event.data?.provider || 'unknown';
          timestamp = event.timestamp || event.data?.timestamp || '';
        } else if (event.type === 'START') {
          model = event.data?.model || model;
          kitName = event.data?.kitName || kitName;
        } else if (event.type === 'USER_MESSAGE' && !promptSummary) {
          const text = event.data?.text || event.data?.prompt || '';
          promptSummary = text.substring(0, 200);
        } else if (event.type === 'TURN_START') {
          turns++;
        } else if (event.type === 'EXECUTING_TOOL') {
          toolCallCount++;
          const toolName = event.data?.name || '';
          const args = event.data?.input || event.data?.args || {};
          if (toolName === 'run_command') {
            const cmd = args.command || '';
            if (cmd.includes('build') || cmd.includes('ng build')) {
              buildAttempts++;
            }
          }
        } else if (event.type === 'TOOL_RESULT') {
          if (event.data?.isError) {
            errorCount++;
          }
          // Check for build results
          const output = event.data?.output || event.data?.text || '';
          if (event.data?.toolName === 'run_command' || event.data?.name === 'run_command') {
            const args = event.data?.args || event.data?.input || {};
            const cmd = args.command || '';
            if (cmd.includes('build') || cmd.includes('ng build')) {
              if (event.data?.exitCode === 0 || (!event.data?.isError && output.includes('Build at:'))) {
                buildSuccesses++;
              } else if (event.data?.exitCode !== 0 || event.data?.isError) {
                buildFailures++;
              }
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (!timestamp) return null;

    return {
      provider,
      model,
      turns,
      timestamp,
      promptSummary,
      kitName,
      buildAttempts,
      buildSuccesses,
      buildFailures,
      toolCallCount,
      errorCount,
    };
  }

  async parseLogFile(filename: string): Promise<LogEvent[]> {
    const logDir = getLogDir();
    const filePath = path.join(logDir, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    const events: LogEvent[] = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    return events;
  }

  extractMetrics(events: LogEvent[]): SessionMetrics {
    let provider = 'unknown';
    let model = 'unknown';
    let turns = 0;
    let promptSummary = '';
    let kitName: string | undefined;
    let buildAttempts = 0;
    let buildSuccesses = 0;
    let buildFailures = 0;
    let toolCallCount = 0;
    let errorCount = 0;
    let timestamp = '';
    const toolCallsByName: Record<string, number> = {};
    const fileChurn: Record<string, number> = {};
    let kitDocsRead = false;

    for (const event of events) {
      switch (event.type) {
        case 'INIT':
          provider = event.data?.provider || 'unknown';
          timestamp = event.timestamp || event.data?.timestamp || '';
          break;

        case 'START':
          model = event.data?.model || model;
          kitName = event.data?.kitName || kitName;
          break;

        case 'USER_MESSAGE':
          if (!promptSummary) {
            const text = event.data?.text || event.data?.prompt || '';
            promptSummary = text.substring(0, 200);
          }
          break;

        case 'TURN_START':
          turns++;
          break;

        case 'EXECUTING_TOOL': {
          toolCallCount++;
          const toolName = event.data?.name || 'unknown';
          toolCallsByName[toolName] = (toolCallsByName[toolName] || 0) + 1;

          const args = event.data?.input || event.data?.args || {};

          // Track file writes for churn
          if (toolName === 'write_file' || toolName === 'write_files') {
            if (toolName === 'write_files' && Array.isArray(args.files)) {
              for (const f of args.files) {
                const fp = f.path || f.filePath;
                if (fp) fileChurn[fp] = (fileChurn[fp] || 0) + 1;
              }
            } else {
              const fp = args.path || args.filePath;
              if (fp) fileChurn[fp] = (fileChurn[fp] || 0) + 1;
            }
          }

          // Track kit docs reads
          if ((toolName === 'read_file' || toolName === 'read_files') && JSON.stringify(args).includes('.adorable/')) {
            kitDocsRead = true;
          }

          // Track builds
          if (toolName === 'run_command') {
            const cmd = args.command || '';
            if (cmd.includes('build') || cmd.includes('ng build')) {
              buildAttempts++;
            }
          }
          break;
        }

        case 'TOOL_RESULT': {
          if (event.data?.isError) errorCount++;

          // Track build success/failure
          const toolName = event.data?.toolName || event.data?.name || '';
          if (toolName === 'run_command') {
            const args = event.data?.args || event.data?.input || {};
            const cmd = args.command || '';
            if (cmd.includes('build') || cmd.includes('ng build')) {
              if (event.data?.exitCode === 0) {
                buildSuccesses++;
              } else if (event.data?.exitCode !== 0 || event.data?.isError) {
                buildFailures++;
              }
            }
          }
          break;
        }
      }
    }

    return {
      provider,
      model,
      turns,
      promptSummary,
      kitName,
      buildAttempts,
      buildSuccesses,
      buildFailures,
      toolCallCount,
      errorCount,
      toolCallsByName,
      fileChurn,
      kitDocsRead,
      timestamp,
    };
  }

  buildAnalysisPrompt(events: LogEvent[], metrics: SessionMetrics, kitDocs?: Record<string, string>): string {
    const parts: string[] = [];

    parts.push('You are an expert at analyzing AI coding session logs for the Adorable Angular IDE.');
    parts.push('Analyze this session and return a JSON array of improvement suggestions.');
    parts.push('');

    // Pre-computed metrics
    parts.push('## Session Metrics');
    parts.push(`- Provider: ${metrics.provider}`);
    parts.push(`- Model: ${metrics.model}`);
    parts.push(`- Turns: ${metrics.turns}`);
    parts.push(`- Tool calls: ${metrics.toolCallCount}`);
    parts.push(`- Errors: ${metrics.errorCount}`);
    parts.push(`- Build attempts: ${metrics.buildAttempts} (success: ${metrics.buildSuccesses}, fail: ${metrics.buildFailures})`);
    parts.push(`- Kit: ${metrics.kitName || 'none'}`);
    parts.push(`- Kit docs read before writing: ${metrics.kitDocsRead ? 'yes' : 'no'}`);
    parts.push(`- User prompt: ${metrics.promptSummary}`);
    parts.push('');

    // Tool calls breakdown
    parts.push('## Tool Calls by Name');
    for (const [name, count] of Object.entries(metrics.toolCallsByName)) {
      parts.push(`- ${name}: ${count}`);
    }
    parts.push('');

    // File churn
    const highChurn = Object.entries(metrics.fileChurn).filter(([, count]) => count >= 3);
    if (highChurn.length > 0) {
      parts.push('## High File Churn (3+ writes)');
      for (const [fp, count] of highChurn) {
        parts.push(`- ${fp}: ${count} writes`);
      }
      parts.push('');
    }

    // Condensed event log
    parts.push('## Condensed Event Log');
    let currentTurn = 0;
    let charBudget = 20000;

    for (const event of events) {
      if (charBudget <= 0) {
        parts.push('... (truncated)');
        break;
      }

      let line = '';
      switch (event.type) {
        case 'TURN_START':
          currentTurn++;
          line = `\n--- Turn ${currentTurn} ---`;
          break;
        case 'EXECUTING_TOOL': {
          const name = event.data?.name || 'unknown';
          const args = event.data?.input || event.data?.args || {};
          const argsStr = this.abbreviateArgs(args);
          line = `  TOOL: ${name}(${argsStr})`;
          break;
        }
        case 'TOOL_RESULT': {
          const isError = event.data?.isError;
          const output = (event.data?.output || event.data?.text || '').substring(0, 300);
          if (isError) {
            line = `  ERROR: ${output}`;
          } else if (output.includes('error') || output.includes('Error')) {
            line = `  RESULT (contains errors): ${output}`;
          }
          break;
        }
        case 'USER_MESSAGE': {
          const text = (event.data?.text || event.data?.prompt || '').substring(0, 200);
          line = `  USER: ${text}`;
          break;
        }
      }

      if (line) {
        charBudget -= line.length;
        parts.push(line);
      }
    }
    parts.push('');

    // Kit docs context
    if (kitDocs && Object.keys(kitDocs).length > 0) {
      parts.push('## Current Kit Documentation Files');
      let docBudget = 8000;
      for (const [filePath, content] of Object.entries(kitDocs)) {
        if (docBudget <= 0) break;
        const truncated = content.substring(0, Math.min(content.length, docBudget));
        parts.push(`### ${filePath}`);
        parts.push(truncated);
        parts.push('');
        docBudget -= truncated.length;
      }
    }

    // Output instructions
    parts.push('## Output Instructions');
    parts.push('Return ONLY a JSON array of suggestion objects. Each suggestion must have:');
    parts.push('- id: unique string (e.g. "sug_1", "sug_2")');
    parts.push('- type: one of "kit_doc_improvement", "system_prompt_improvement", "kit_config", "workflow_recommendation", "project_structure"');
    parts.push('- severity: "high", "medium", or "low"');
    parts.push('- title: short title');
    parts.push('- description: detailed explanation');
    parts.push('- patch (optional): { filePath, newContent, kitId } for actionable suggestions');
    parts.push('');
    parts.push('Focus areas:');
    parts.push('- If the AI explored node_modules instead of reading kit docs, suggest improving doc discoverability/content');
    parts.push('- If imports were wrong, suggest fixing the component doc import examples');
    parts.push('- If build failure loops occurred, suggest adding common error patterns to kit docs');
    parts.push('- If file churn was high, suggest system prompt additions encouraging read-before-write');
    parts.push('- If excessive turns (>10), suggest workflow recommendations');
    parts.push('- General quality improvements to kit documentation and project structure');

    return parts.join('\n');
  }

  private abbreviateArgs(args: any): string {
    if (!args || typeof args !== 'object') return '';
    const entries = Object.entries(args);
    return entries
      .map(([key, value]) => {
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        const truncated = str && str.length > 80 ? str.substring(0, 80) + '...' : str;
        return `${key}=${truncated}`;
      })
      .join(', ')
      .substring(0, 200);
  }

  async analyzeWithAI(
    prompt: string,
    apiKey: string,
    model?: string
  ): Promise<SessionSuggestion[]> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    try {
      const suggestions: SessionSuggestion[] = JSON.parse(jsonMatch[0]);
      return suggestions.filter(
        s => s.id && s.type && s.severity && s.title && s.description
      );
    } catch {
      return [];
    }
  }
}

export const sessionAnalyzerService = new SessionAnalyzerService();
