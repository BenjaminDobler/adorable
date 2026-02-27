import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { FileSystemInterface } from '../types';
import { minimatch } from 'minimatch';

const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.angular', 'dist', '.cache', 'tmp', '.nx']);

export type ExecDelegate = (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

/**
 * Disk-backed FileSystemInterface that operates directly on a project directory.
 * The single filesystem implementation for all modes (Docker, Native, local).
 *
 * When an `execDelegate` is provided (e.g. wrapping Docker/Native container exec),
 * `exec()` delegates to it instead of running commands locally via child_process.
 *
 * All files (including kit docs in `.adorable/`) live on real disk — no in-memory
 * overlay. `.adorable/` writes are excluded from accumulatedFiles so they don't
 * leak back to the client as "generated files".
 */
export class DiskFileSystem implements FileSystemInterface {
  private accumulatedFiles: any = {};

  constructor(private projectPath: string, private execDelegate?: ExecDelegate) {}

  private resolve(filePath: string): string {
    // Prevent path traversal
    const resolved = path.resolve(this.projectPath, filePath);
    if (!resolved.startsWith(this.projectPath)) {
      throw new Error(`Path traversal detected: ${filePath}`);
    }
    return resolved;
  }

  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolve(filePath);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch {
      throw new Error(`File not found or unreadable: ${filePath}`);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolve(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');

    // Track change for client, but skip .adorable/ docs (kit-injected, not user content)
    if (!filePath.startsWith('.adorable/') && !filePath.startsWith('.adorable\\')) {
      this.addToAccumulated(filePath, content);
    }
  }

  async editFile(filePath: string, oldStr: string, newStr: string): Promise<void> {
    const content = await this.readFile(filePath);
    if (!content.includes(oldStr)) {
      const firstLine = oldStr.split('\n')[0].trim();
      const lines = content.split('\n');
      const closestIdx = lines.findIndex(l => l.includes(firstLine));
      let hint = '';
      if (closestIdx >= 0) {
        const start = Math.max(0, closestIdx - 1);
        const end = Math.min(lines.length, closestIdx + 3);
        hint = `\nThe first line of old_str ("${firstLine.slice(0, 80)}") was found at line ${closestIdx + 1}, but the full old_str doesn't match. Nearby content:\n${lines.slice(start, end).join('\n')}`;
      } else {
        hint = `\nHint: The first line ("${firstLine.slice(0, 80)}") was not found in the file. Did you read the file first?`;
      }
      throw new Error(`old_str not found in ${filePath}${hint}`);
    }
    const parts = content.split(oldStr);
    if (parts.length > 2) {
      throw new Error(`old_str is not unique in ${filePath}`);
    }
    const newContent = content.replace(oldStr, newStr);
    await this.writeFile(filePath, newContent);
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.resolve(filePath);
    try {
      await fs.unlink(fullPath);
    } catch {
      throw new Error(`Failed to delete file: ${filePath}`);
    }
    this.markFileDeleted(filePath);
  }

  async listDir(dirPath: string): Promise<string[]> {
    const fullPath = this.resolve(dirPath);
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries
        .filter(e => !EXCLUDED_DIRS.has(e.name) && e.name !== '.DS_Store')
        .map(e => e.isDirectory() ? e.name + '/' : e.name)
        .sort();
    } catch {
      return [];
    }
  }

  async glob(pattern: string): Promise<string[]> {
    const allFiles = await this.walkDir(this.projectPath, '');
    return allFiles.filter(f => minimatch(f, pattern));
  }

  async grep(pattern: string, searchPath = '.', caseSensitive = false): Promise<string[]> {
    const results: string[] = [];
    const flags = caseSensitive ? '' : 'i';
    const regex = new RegExp(pattern, flags);

    let basePath = searchPath;
    if (basePath === '.' || basePath === './') basePath = '';

    const allFiles = await this.walkDir(
      basePath ? this.resolve(basePath) : this.projectPath,
      basePath ? basePath + (basePath.endsWith('/') ? '' : '/') : ''
    );

    for (const filePath of allFiles) {
      try {
        const content = await this.readFile(filePath);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push(`${filePath}:${i + 1}:${lines[i].trim()}`);
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
    return results;
  }

  async exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (this.execDelegate) {
      return this.execDelegate(command);
    }
    return new Promise((resolve) => {
      execFile('sh', ['-c', command], { cwd: this.projectPath, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? (error as any).code ?? 1 : 0,
        });
      });
    });
  }

  getAccumulatedFiles(): any {
    return this.accumulatedFiles;
  }

  // --- Private helpers ---

  private async walkDir(dirPath: string, prefix: string): Promise<string[]> {
    const results: string[] = [];
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name === '.DS_Store') continue;

      const relativePath = prefix + entry.name;
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const sub = await this.walkDir(fullPath, relativePath + '/');
        results.push(...sub);
      } else if (entry.isFile()) {
        results.push(relativePath);
      }
    }
    return results;
  }

  private addToAccumulated(filePath: string, content: string) {
    const parts = filePath.split('/');
    let current = this.accumulatedFiles;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) current[part] = { directory: {} };
      else if (!current[part].directory) current[part] = { directory: {} };
      current = current[part].directory;
    }
    const fileName = parts[parts.length - 1];
    current[fileName] = { file: { contents: content } };
  }

  private markFileDeleted(filePath: string) {
    const parts = filePath.split('/');
    let current = this.accumulatedFiles;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) current[part] = { directory: {} };
      else if (!current[part].directory) current[part] = { directory: {} };
      current = current[part].directory;
    }
    const fileName = parts[parts.length - 1];
    current[fileName] = { deleted: true };
  }
}
