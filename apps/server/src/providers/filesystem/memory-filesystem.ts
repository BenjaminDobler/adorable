import { FileSystemInterface } from '../types';
import { minimatch } from 'minimatch';

export class MemoryFileSystem implements FileSystemInterface {
  // accumulatedFiles stores the *changes* (diff) we want to return
  // fileMap stores the *current state* of the project (for reading)
  constructor(
    private fileMap: Record<string, string>, 
    private accumulatedFiles: any = {} 
  ) {}

  async readFile(path: string): Promise<string> {
    const content = this.fileMap[path];
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.fileMap[path] = content;
    this.addFileToStructure(this.accumulatedFiles, path, content);
  }

  async editFile(path: string, oldStr: string, newStr: string): Promise<void> {
    const content = await this.readFile(path);
    if (!content.includes(oldStr)) {
      throw new Error(`old_str not found in ${path}`);
    }
    const parts = content.split(oldStr);
    if (parts.length > 2) {
      throw new Error(`old_str is not unique in ${path}`);
    }
    const newContent = content.replace(oldStr, newStr);
    await this.writeFile(path, newContent);
  }

  async listDir(path: string): Promise<string[]> {
    let dir = path;
    if (dir === '.' || dir === './') dir = '';
    if (dir && !dir.endsWith('/')) dir += '/';
    
    const matching = Object.keys(this.fileMap)
      .filter(k => k.startsWith(dir))
      .map(k => {
        const relative = k.substring(dir.length);
        const parts = relative.split('/');
        const isDir = parts.length > 1;
        return isDir ? parts[0] + '/' : parts[0];
      });
    
    return Array.from(new Set(matching)).sort();
  }

  async glob(pattern: string): Promise<string[]> {
    return Object.keys(this.fileMap).filter(path => minimatch(path, pattern));
  }

  getAccumulatedFiles() {
    return this.accumulatedFiles;
  }

  private addFileToStructure(root: any, path: string, content: string) {
    const parts = path.split('/');
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) current[part] = { directory: {} };
      else if (!current[part].directory) current[part] = { directory: {} };
      current = current[part].directory;
    }
    const fileName = parts[parts.length - 1];
    current[fileName] = { file: { contents: content } };
  }
}
