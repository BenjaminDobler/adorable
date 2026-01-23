import * as path from 'path';
import * as fs from 'fs/promises';

export class ProjectService {
  async saveFilesToDisk(basePath: string, files: any) {
    for (const name in files) {
      const node = files[name];
      const targetPath = path.join(basePath, name);
      if (node.file) {
        let contents = node.file.contents;

        // Fix base href in index.html for published sites
        if (name === 'index.html' && typeof contents === 'string') {
          contents = this.fixBaseHref(contents);
        }

        if (node.file.encoding === 'base64') {
          await fs.writeFile(targetPath, Buffer.from(contents, 'base64'));
        } else {
          await fs.writeFile(targetPath, contents);
        }
      } else if (node.directory) {
        await fs.mkdir(targetPath, { recursive: true });
        await this.saveFilesToDisk(targetPath, node.directory);
      }
    }
  }

  // Fix base href to use relative paths for published sites
  fixBaseHref(html: string): string {
    // Replace any base href with "./" for relative paths
    return html.replace(/<base\s+href="[^"]*"\s*\/?>/i, '<base href="./">');
  }
}

export const projectService = new ProjectService();
