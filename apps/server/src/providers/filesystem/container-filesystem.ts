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
      throw new Error(`old_str not found in ${path}`);
    }
    const parts = content.split(oldStr);
    if (parts.length > 2) {
      throw new Error(`old_str is not unique in ${path}`);
    }
    const newContent = content.replace(oldStr, newStr);
    await this.writeFile(path, newContent);
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
