import * as path from 'path';
import * as fs from 'fs/promises';

export class ProjectService {
  async saveFilesToDisk(basePath: string, files: any) {
    for (const name in files) {
      const node = files[name];
      const targetPath = path.join(basePath, name);
      if (node.file) {
        if (node.file.encoding === 'base64') {
          await fs.writeFile(targetPath, Buffer.from(node.file.contents, 'base64'));
        } else {
          await fs.writeFile(targetPath, node.file.contents);
        }
      } else if (node.directory) {
        await fs.mkdir(targetPath, { recursive: true });
        await this.saveFilesToDisk(targetPath, node.directory);
      }
    }
  }
}

export const projectService = new ProjectService();
