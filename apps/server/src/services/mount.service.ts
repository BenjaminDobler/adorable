import * as fs from 'fs/promises';
import * as path from 'path';
import { projectFsService } from './project-fs.service';
import { kitFsService } from './kit-fs.service';
import { RUNTIME_SCRIPTS } from '@adorable/shared-types';

export class MountService {
  /**
   * Prepare a project directory for the dev server.
   * Files are already on disk — we only need to:
   * 1. Copy missing kit template files into the project dir (if a kit is set)
   * 2. Transform index.html in-place (base href + runtime scripts)
   */
  async prepareAndWriteFiles(projectId: string, kitId: string | null): Promise<void> {
    const projectPath = projectFsService.getProjectPath(projectId);

    // 1. If a custom kit is set, copy template files that don't exist in the project yet
    if (kitId && kitId !== 'default-angular-21') {
      const hasTemplate = await kitFsService.hasTemplateFiles(kitId);
      if (hasTemplate) {
        const templatePath = kitFsService.getKitTemplatePath(kitId);
        await this.copyMissingFiles(templatePath, projectPath);
      }
    }

    // 2. Transform index.html in-place
    await this.transformIndexHtml(projectPath, '/api/proxy/');
  }

  /**
   * Recursively copy files from src to dest, skipping files that already exist at dest.
   */
  private async copyMissingFiles(src: string, dest: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(src, { withFileTypes: true });
    } catch {
      return;
    }

    await fs.mkdir(dest, { recursive: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyMissingFiles(srcPath, destPath);
      } else if (entry.isFile()) {
        try {
          await fs.access(destPath);
          // File exists in project — project wins, skip
        } catch {
          // File doesn't exist — copy from kit template
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(srcPath, destPath);
        }
      }
    }
  }

  /**
   * Read index.html from the project directory, set base href and inject
   * runtime scripts, then write it back.
   */
  private async transformIndexHtml(projectPath: string, baseHref: string): Promise<void> {
    const indexPath = path.join(projectPath, 'index.html');

    let content: string;
    try {
      content = await fs.readFile(indexPath, 'utf-8');
    } catch {
      return; // No index.html, nothing to transform
    }

    // Set base href
    if (content.includes('<base href=')) {
      content = content.replace(/<base href="[^"]*"/, `<base href="${baseHref}"`);
    } else {
      content = content.replace('<head>', `<head>\n  <base href="${baseHref}" />`);
    }

    // Inject runtime scripts
    const scriptTag = '<!-- ADORABLE_RUNTIME_SCRIPTS -->';
    if (content.includes(scriptTag)) {
      const pattern = new RegExp(`${scriptTag}[\\s\\S]*${scriptTag}`);
      content = content.replace(pattern, `${scriptTag}\n${RUNTIME_SCRIPTS}\n${scriptTag}`);
    } else {
      content = content.replace('</head>', `${scriptTag}\n${RUNTIME_SCRIPTS}\n${scriptTag}\n</head>`);
    }

    await fs.writeFile(indexPath, content, 'utf-8');
  }
}

export const mountService = new MountService();
