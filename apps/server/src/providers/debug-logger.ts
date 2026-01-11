import * as fs from 'fs';
import * as path from 'path';

export class DebugLogger {
  private logPath: string;

  constructor(providerName: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${providerName}_trace_${timestamp}.jsonl`;
    // Ensure debug_logs exists relative to where the server runs (usually project root)
    const logDir = path.resolve(process.cwd(), 'debug_logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    this.logPath = path.join(logDir, filename);
    this.log('INIT', { provider: providerName, timestamp: new Date().toISOString() });
  }

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
}
