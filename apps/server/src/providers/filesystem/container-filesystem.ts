import { FileSystemInterface } from '../types';
import { DockerManager } from '../container/docker-manager';

export class ContainerFileSystem implements FileSystemInterface {
  private accumulatedFiles: any = {};

  constructor(private manager: DockerManager) {}

  async readFile(path: string): Promise<string> {
    // We use cat. If file doesn't exist, exit code will be non-zero.
    const { output, exitCode } = await this.manager.exec(['cat', path]);
    if (exitCode !== 0) {
      throw new Error(`File not found or unreadable: ${path}`);
    }
    return output;
  }

  async writeFile(path: string, content: string): Promise<void> {
    // Construct the file tree expected by DockerManager.copyFiles
    // path can be 'src/app/foo.ts'
    const tree = this.buildFileTree(path, content);
    await this.manager.copyFiles(tree);
    
    // Track change for client
    this.mergeFileTree(this.accumulatedFiles, tree);
  }

  async editFile(path: string, oldStr: string, newStr: string): Promise<void> {
    // For safety, we read, replace, write.
    // Ideally we could use 'sed' but dealing with escaping is a nightmare.
    const content = await this.readFile(path);
    if (!content.includes(oldStr)) {
      // Provide a helpful hint: show the first line of old_str and nearby content
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
      throw new Error(`old_str not found in ${path}${hint}`);
    }
    const parts = content.split(oldStr);
    if (parts.length > 2) {
      throw new Error(`old_str is not unique in ${path}`);
    }
    const newContent = content.replace(oldStr, newStr);
    await this.writeFile(path, newContent);
  }

  async deleteFile(path: string): Promise<void> {
    const { exitCode, output } = await this.manager.exec(['rm', '-f', path]);
    if (exitCode !== 0) {
      throw new Error(`Failed to delete file: ${path} - ${output}`);
    }
    // Mark as deleted in accumulated files for client sync
    this.markFileDeleted(this.accumulatedFiles, path);
  }

  private markFileDeleted(root: any, path: string) {
    const parts = path.split('/');
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) current[part] = { directory: {} };
      else if (!current[part].directory) current[part] = { directory: {} };
      current = current[part].directory;
    }
    const fileName = parts[parts.length - 1];
    current[fileName] = { deleted: true };
  }

  getAccumulatedFiles() {
    return this.accumulatedFiles;
  }

  private mergeFileTree(base: any, update: any) {
    for (const key in update) {
      if (update[key].directory) {
        if (!base[key]) base[key] = { directory: {} };
        if (!base[key].directory) base[key] = { directory: {} }; // Overwrite if file
        this.mergeFileTree(base[key].directory, update[key].directory);
      } else {
        base[key] = update[key];
      }
    }
  }

  async listDir(path: string): Promise<string[]> {
    // ls -1F to get names with type indicators (/ for dir)
    const { output, exitCode } = await this.manager.exec(['ls', '-1F', path]);
    if (exitCode !== 0) {
       // If dir doesn't exist, return empty or throw? 
       // MemoryFS returns 'Directory is empty or not found' string in the calling code,
       // but strictly listDir returns string[].
       // Let's return empty array if failed, log warning.
       return [];
    }
    return output.split('\n').filter(Boolean).sort();
  }

  async glob(pattern: string): Promise<string[]> {
    // Use 'find' command
    // find . -name "*.ts"
    // Convert glob pattern to find compatible? 
    // Actually, 'find' handles simple globs like *.ts. 
    // Complex globs (**/*.ts) might need translation or just rely on shell expansion if possible.
    // Let's assume standard 'find' syntax for now.
    
    // NOTE: 'pattern' here is a minimatch glob (e.g. 'src/**/*.ts').
    // 'find' doesn't support ** properly in all versions.
    // 'find . -name ...' is recursive by default.
    // So 'src/**/*.ts' -> find src -name '*.ts' roughly. 
    
    // Fallback: List all files and use minimatch in memory (safest)
    // Run: find . -type f
    const { output } = await this.manager.exec(['find', '.', '-type', 'f']);
    const allFiles = output.split('\n').filter(Boolean).map(f => f.replace(/^\.\//, '')); // remove leading ./
    
    const { minimatch } = await import('minimatch');
    return allFiles.filter(f => minimatch(f, pattern));
  }

  async grep(pattern: string, path: string = '.', caseSensitive = false): Promise<string[]> {
    // grep -rn "pattern" path
    const args = ['grep', '-rn'];
    if (!caseSensitive) {
       args.push('-i');
    }
    args.push(pattern);
    args.push(path);

    const { output, exitCode } = await this.manager.exec(args);
    // grep exit code 1 means no matches found, which is not an error
    if (exitCode !== 0 && exitCode !== 1) {
       throw new Error(`grep failed: ${output}`);
    }
    
    return output.split('\n').filter(Boolean);
  }

  async exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Security: This command runs INSIDE the container.
    // We use sh -c to allow piping etc.
    const { output, exitCode } = await this.manager.exec(['sh', '-c', command]);
    // Our DockerManager combines stdout/stderr into 'output'. 
    // Ideally we should separate them, but for now we return output as stdout.
    return { stdout: output, stderr: '', exitCode };
  }

  private buildFileTree(path: string, content: string) {
    const parts = path.split('/');
    const root: any = {};
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      current[part] = { directory: {} };
      current = current[part].directory;
    }
    const fileName = parts[parts.length - 1];
    current[fileName] = { file: { contents: content } };
    return root;
  }
}
