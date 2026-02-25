import * as path from 'path';
import * as fs from 'fs/promises';
import { STORAGE_DIR } from '../config';

const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.angular', 'dist', '.cache', 'tmp', '.nx', '.adorable']);
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.eot', '.ttf', '.woff', '.woff2', '.mp3', '.mp4', '.zip', '.tar', '.gz']);

export class ProjectFsService {
  /**
   * Get the filesystem path for a project.
   */
  getProjectPath(projectId: string): string {
    const projectsDir = process.env['ADORABLE_PROJECTS_DIR'] || path.join(STORAGE_DIR, 'projects');
    return path.join(projectsDir, projectId);
  }

  /**
   * Check if a project has files on disk.
   */
  async projectExistsOnDisk(projectId: string): Promise<boolean> {
    try {
      const projectPath = this.getProjectPath(projectId);
      const stat = await fs.stat(projectPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Write a WebContainerFiles tree to disk recursively.
   */
  async writeProjectFiles(projectId: string, files: any): Promise<void> {
    const projectPath = this.getProjectPath(projectId);
    await fs.mkdir(projectPath, { recursive: true });
    await this.writeTree(projectPath, files);
  }

  private async writeTree(basePath: string, files: any): Promise<void> {
    const fileWrites: Promise<void>[] = [];
    const dirWrites: Promise<void>[] = [];

    for (const name in files) {
      if (name === '.DS_Store' || name === '.adorable') continue;
      const node = files[name];
      const targetPath = path.join(basePath, name);

      if (node.file) {
        fileWrites.push(
          fs.mkdir(path.dirname(targetPath), { recursive: true }).then(() => {
            const contents = node.file.contents;
            if (node.file.encoding === 'base64') {
              return fs.writeFile(targetPath, Buffer.from(contents, 'base64'));
            } else {
              return fs.writeFile(targetPath, contents);
            }
          })
        );
      } else if (node.directory) {
        dirWrites.push(
          fs.mkdir(targetPath, { recursive: true }).then(() =>
            this.writeTree(targetPath, node.directory)
          )
        );
      }
    }

    await Promise.all([...fileWrites, ...dirWrites]);
  }

  /**
   * Read project files from disk into a WebContainerFiles tree.
   * Excludes node_modules, .git, .angular, dist, etc.
   */
  async readProjectFiles(projectId: string): Promise<any> {
    const projectPath = this.getProjectPath(projectId);
    return this.readTree(projectPath);
  }

  private async readTree(dirPath: string): Promise<any> {
    const result: any = {};
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return result;
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name === '.DS_Store') continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        result[entry.name] = {
          directory: await this.readTree(fullPath)
        };
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          const buffer = await fs.readFile(fullPath);
          result[entry.name] = {
            file: { contents: buffer.toString('base64'), encoding: 'base64' }
          };
        } else {
          const contents = await fs.readFile(fullPath, 'utf-8');
          result[entry.name] = {
            file: { contents }
          };
        }
      }
    }

    return result;
  }

  /**
   * Read project files into a flat Record<path, content> map.
   * Useful for MemoryFileSystem initialization.
   */
  async readProjectFilesFlat(projectId: string): Promise<Record<string, string>> {
    const projectPath = this.getProjectPath(projectId);
    const result: Record<string, string> = {};
    await this.flattenTree(projectPath, '', result);
    return result;
  }

  private async flattenTree(basePath: string, prefix: string, result: Record<string, string>): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(basePath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name === '.DS_Store') continue;

      const fullPath = path.join(basePath, entry.name);
      const relativePath = prefix + entry.name;

      if (entry.isDirectory()) {
        await this.flattenTree(fullPath, relativePath + '/', result);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!BINARY_EXTENSIONS.has(ext)) {
          try {
            result[relativePath] = await fs.readFile(fullPath, 'utf-8');
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  /**
   * Delete a project's files from disk.
   */
  async deleteProjectFiles(projectId: string): Promise<void> {
    const projectPath = this.getProjectPath(projectId);
    try {
      await fs.rm(projectPath, { recursive: true, force: true });
    } catch {
      // Already gone or never existed
    }
  }

  /**
   * Copy a project's files to a new project directory.
   */
  async copyProject(sourceId: string, targetId: string): Promise<void> {
    const sourcePath = this.getProjectPath(sourceId);
    const targetPath = this.getProjectPath(targetId);
    await this.copyDir(sourcePath, targetPath);
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      // Skip node_modules and .git when copying
      if (entry.name === 'node_modules' || entry.name === '.git') continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

export const projectFsService = new ProjectFsService();
