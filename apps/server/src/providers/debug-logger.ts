import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const MAX_FIELD_LENGTH = 20000;

function getLogDir(): string {
  if (process.env['ADORABLE_DESKTOP_MODE'] === 'true') {
    // Desktop app: write logs next to projects in ~/.adorable/debug_logs
    const baseDir = process.env['ADORABLE_PROJECTS_DIR']
      ? path.resolve(process.env['ADORABLE_PROJECTS_DIR'], '..')
      : path.join(os.homedir(), '.adorable');
    return path.join(baseDir, 'debug_logs');
  }
  return path.resolve(process.cwd(), 'debug_logs');
}

export class DebugLogger {
  private logPath: string;
  private providerName: string;

  constructor(providerName: string, projectId?: string) {
    this.providerName = providerName;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = projectId
      ? `${providerName}_trace_${projectId}_${timestamp}.jsonl`
      : `${providerName}_trace_${timestamp}.jsonl`;
    const logDir = getLogDir();
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    this.logPath = path.join(logDir, filename);
    this.log('INIT', { provider: providerName, timestamp: new Date().toISOString() });
  }

  /**
   * Append a structured event to the trace file. Used for machine-readable
   * events (TURN_START, EXECUTING_TOOL, etc.). Does not echo to the console.
   */
  log(type: string, data: any) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      data
    };
    try {
      fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n');
    } catch (e) {
      console.error('Failed to write to debug log:', e);
    }
  }

  /**
   * Log large text content, truncating if necessary.
   */
  logText(type: string, text: string, meta?: Record<string, any>) {
    const truncated = text.length > MAX_FIELD_LENGTH;
    this.log(type, {
      ...meta,
      text: truncated ? text.substring(0, MAX_FIELD_LENGTH) + `\n...[TRUNCATED, total ${text.length} chars]` : text,
      length: text.length,
      truncated
    });
  }

  /**
   * Human-readable progress message. Appended to the trace file as INFO
   * AND echoed to the dev console with a `[provider]` prefix.
   * Use these instead of bare console.log so traces capture them.
   */
  info(message: string, meta?: Record<string, any>) {
    this.log('INFO', meta ? { message, ...meta } : { message });
    console.log(`[${this.providerName}] ${message}`);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.log('WARN', meta ? { message, ...meta } : { message });
    console.warn(`[${this.providerName}] ${message}`);
  }

  error(message: string, meta?: Record<string, any>) {
    this.log('ERROR', meta ? { message, ...meta } : { message });
    console.error(`[${this.providerName}] ${message}`);
  }
}
