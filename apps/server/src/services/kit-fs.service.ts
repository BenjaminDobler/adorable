import * as path from 'path';
import * as fs from 'fs/promises';
import { KITS_DIR } from '../config';
import { prisma } from '../db/prisma';
import { parseKitsFromSettings, updateKitsInSettings } from '../providers/kits/kit-registry';
import { generateComponentDocFiles } from '../providers/kits/doc-generator';
import { Kit, WebContainerFiles, WebContainerFile, WebContainerDirectory } from '../providers/kits/types';

export interface KitFileEntry {
  path: string;
  size: number;
  modified: string;
}

export class KitFsService {
  /**
   * Get the .adorable directory path for a kit.
   */
  getKitAdorablePath(kitId: string): string {
    return path.join(KITS_DIR, kitId, '.adorable');
  }

  /**
   * Get the template directory path for a kit.
   */
  getKitTemplatePath(kitId: string): string {
    return path.join(KITS_DIR, kitId, 'template');
  }

  /**
   * Read all .adorable files for a kit from disk.
   * Returns a flat Record<string, string> with keys like ".adorable/components/Button.md".
   */
  async readKitAdorableFiles(kitId: string): Promise<Record<string, string>> {
    const adorablePath = this.getKitAdorablePath(kitId);
    const result: Record<string, string> = {};
    await this.readDirRecursive(adorablePath, '.adorable', result);
    return result;
  }

  private async readDirRecursive(
    dirPath: string,
    prefix: string,
    result: Record<string, string>
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = prefix + '/' + entry.name;

      if (entry.isDirectory()) {
        await this.readDirRecursive(fullPath, relativePath, result);
      } else if (entry.isFile()) {
        try {
          result[relativePath] = await fs.readFile(fullPath, 'utf-8');
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  /**
   * Write a Record<string, string> of .adorable files to disk for a kit.
   * Creates directories as needed.
   */
  async writeKitAdorableFiles(kitId: string, files: Record<string, string>): Promise<void> {
    const kitDir = path.join(KITS_DIR, kitId);
    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = path.join(kitDir, relativePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    }
  }

  /**
   * Smart merge: writes new files, preserves user-edited existing files by default,
   * removes docs for components no longer in the kit.
   * README.md and design-tokens.md are always regenerated.
   */
  async regenerateAdorableFiles(
    kitId: string,
    generatedFiles: Record<string, string>,
    options?: { preserveExisting?: boolean }
  ): Promise<void> {
    const preserveExisting = options?.preserveExisting !== false; // default true

    // Read existing files on disk
    const existingFiles = await this.readKitAdorableFiles(kitId);
    const alwaysRegenerate = new Set(['README.md', 'design-tokens.md']);

    // Build the final set of files
    const finalFiles: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(generatedFiles)) {
      const fileName = path.basename(filePath);

      if (alwaysRegenerate.has(fileName)) {
        // Always overwrite README and design tokens
        finalFiles[filePath] = content;
      } else if (preserveExisting && existingFiles[filePath]) {
        // Preserve user-edited file
        finalFiles[filePath] = existingFiles[filePath];
      } else {
        // New file or overwrite mode
        finalFiles[filePath] = content;
      }
    }

    // Remove stale doc files: files on disk that are no longer in the generated set
    const generatedPaths = new Set(Object.keys(generatedFiles));
    for (const existingPath of Object.keys(existingFiles)) {
      if (!generatedPaths.has(existingPath)) {
        // This file is no longer in the kit — delete it from disk
        const fullPath = path.join(path.join(KITS_DIR, kitId), existingPath);
        try {
          await fs.unlink(fullPath);
        } catch {
          // Already gone
        }
      }
    }

    // Write the final files
    await this.writeKitAdorableFiles(kitId, finalFiles);
  }

  /**
   * Read a single file from a kit directory.
   */
  async readFile(kitId: string, relativePath: string): Promise<string> {
    const fullPath = path.join(KITS_DIR, kitId, relativePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Write a single file to a kit directory.
   */
  async writeFile(kitId: string, relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(KITS_DIR, kitId, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * Delete a single file from a kit directory.
   */
  async deleteFile(kitId: string, relativePath: string): Promise<void> {
    const fullPath = path.join(KITS_DIR, kitId, relativePath);
    await fs.unlink(fullPath);
  }

  /**
   * List all files in a kit's .adorable directory (paths only).
   */
  async listFiles(kitId: string): Promise<string[]> {
    const files = await this.readKitAdorableFiles(kitId);
    return Object.keys(files);
  }

  /**
   * List all files across the entire kit directory with metadata.
   */
  async listAllKitFiles(kitId: string): Promise<KitFileEntry[]> {
    const kitDir = path.join(KITS_DIR, kitId);
    const entries: KitFileEntry[] = [];
    await this.listDirRecursive(kitDir, '', entries);
    return entries;
  }

  private async listDirRecursive(
    dirPath: string,
    prefix: string,
    entries: KitFileEntry[]
  ): Promise<void> {
    let dirEntries;
    try {
      dirEntries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = prefix ? prefix + '/' + entry.name : entry.name;

      if (entry.isDirectory()) {
        await this.listDirRecursive(fullPath, relativePath, entries);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          entries.push({
            path: relativePath,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        } catch {
          // Skip
        }
      }
    }
  }

  /**
   * Delete a kit's entire directory from disk.
   */
  async deleteKitFiles(kitId: string): Promise<void> {
    const kitDir = path.join(KITS_DIR, kitId);
    try {
      await fs.rm(kitDir, { recursive: true, force: true });
    } catch {
      // Already gone or never existed
    }
  }

  /**
   * Check if a kit has .adorable files on disk.
   */
  async hasAdorableFiles(kitId: string): Promise<boolean> {
    try {
      const adorablePath = this.getKitAdorablePath(kitId);
      const stat = await fs.stat(adorablePath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if a kit has template files on disk.
   */
  async hasTemplateFiles(kitId: string): Promise<boolean> {
    try {
      const templatePath = this.getKitTemplatePath(kitId);
      const stat = await fs.stat(templatePath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Read template files from disk into WebContainerFiles tree format.
   */
  async readKitTemplateFiles(kitId: string): Promise<WebContainerFiles> {
    const templatePath = this.getKitTemplatePath(kitId);
    return this.readDirAsWebContainerFiles(templatePath);
  }

  private async readDirAsWebContainerFiles(dirPath: string): Promise<WebContainerFiles> {
    const result: WebContainerFiles = {};
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return result;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subDir = await this.readDirAsWebContainerFiles(fullPath);
        result[entry.name] = { directory: subDir };
      } else if (entry.isFile()) {
        try {
          // Check if it's a binary file by reading a small chunk
          const buffer = await fs.readFile(fullPath);
          const isBinary = this.isBinaryBuffer(buffer);
          if (isBinary) {
            result[entry.name] = {
              file: { contents: buffer.toString('base64') }
            };
          } else {
            result[entry.name] = {
              file: { contents: buffer.toString('utf-8') }
            };
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
    return result;
  }

  private isBinaryBuffer(buffer: Buffer): boolean {
    // Check first 8KB for null bytes as a heuristic
    const checkLength = Math.min(buffer.length, 8192);
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0) return true;
    }
    return false;
  }

  /**
   * Write WebContainerFiles tree to disk as template files.
   */
  async writeKitTemplateFiles(kitId: string, files: WebContainerFiles): Promise<void> {
    const templatePath = this.getKitTemplatePath(kitId);
    await this.writeWebContainerFilesToDisk(templatePath, files);
  }

  private async writeWebContainerFilesToDisk(basePath: string, files: WebContainerFiles): Promise<void> {
    for (const [name, item] of Object.entries(files)) {
      const fullPath = path.join(basePath, name);
      if ('directory' in item) {
        await fs.mkdir(fullPath, { recursive: true });
        await this.writeWebContainerFilesToDisk(fullPath, (item as WebContainerDirectory).directory);
      } else if ('file' in item) {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        const contents = (item as WebContainerFile).file.contents;
        // Try to detect base64-encoded binary content
        if (typeof contents === 'string' && this.isBase64(contents) && contents.length > 100) {
          try {
            const buffer = Buffer.from(contents, 'base64');
            // Verify it's actually valid base64 by checking round-trip
            if (buffer.toString('base64') === contents) {
              await fs.writeFile(fullPath, buffer);
              continue;
            }
          } catch {
            // Not base64, write as text
          }
        }
        await fs.writeFile(fullPath, contents, 'utf-8');
      }
    }
  }

  private isBase64(str: string): boolean {
    if (str.length % 4 !== 0) return false;
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
  }

  /**
   * Flatten WebContainerFiles tree into flat Record<string, string> of paths.
   * Used to extract .adorable files from template trees.
   */
  flattenWebContainerFiles(files: WebContainerFiles, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, item] of Object.entries(files)) {
      const filePath = prefix ? `${prefix}/${name}` : name;
      if ('directory' in item) {
        const subFiles = this.flattenWebContainerFiles((item as WebContainerDirectory).directory, filePath);
        Object.assign(result, subFiles);
      } else if ('file' in item) {
        result[filePath] = (item as WebContainerFile).file.contents;
      }
    }
    return result;
  }

  /**
   * Extract .adorable files from a WebContainerFiles tree.
   * Returns files with keys like ".adorable/components/Button.md".
   */
  extractAdorableFilesFromTemplate(files: WebContainerFiles): Record<string, string> {
    const flat = this.flattenWebContainerFiles(files);
    const adorableFiles: Record<string, string> = {};
    for (const [filePath, content] of Object.entries(flat)) {
      if (filePath.startsWith('.adorable/') || filePath === '.adorable') {
        adorableFiles[filePath] = content;
      }
    }
    return adorableFiles;
  }

  /**
   * Remove .adorable entries from a WebContainerFiles tree (for storing template without .adorable).
   */
  removeAdorableFromTemplate(files: WebContainerFiles): WebContainerFiles {
    const result: WebContainerFiles = {};
    for (const [name, item] of Object.entries(files)) {
      if (name === '.adorable') continue;
      result[name] = item;
    }
    return result;
  }

  /**
   * Migrate all existing kits to disk storage.
   * Idempotent: skips kits that already have .adorable files on disk.
   * Also extracts .adorable files from template trees and migrates template files to disk.
   */
  async migrateAllKits(): Promise<void> {
    const users = await prisma.user.findMany();
    let migratedCount = 0;
    let skippedCount = 0;
    let templateMigratedCount = 0;

    for (const user of users) {
      let settings: any;
      try {
        settings = typeof user.settings === 'string'
          ? JSON.parse(user.settings || '{}')
          : (user.settings || {});
      } catch {
        continue;
      }

      const kits = parseKitsFromSettings(settings);
      let settingsChanged = false;

      for (const kit of kits) {
        const hasAdorable = await this.hasAdorableFiles(kit.id);

        if (!hasAdorable) {
          // 1. Try generating docs from storybook components
          const docFiles = generateComponentDocFiles(kit);
          if (Object.keys(docFiles).length > 0) {
            await this.writeKitAdorableFiles(kit.id, docFiles);
            migratedCount++;
            console.log(`[Kit Migration] Generated .adorable for kit "${kit.name}" (${kit.id})`);
          }

          // 2. Also extract .adorable files from template tree if present
          if (kit.template?.files && Object.keys(kit.template.files).length > 0) {
            const adorableFromTemplate = this.extractAdorableFilesFromTemplate(kit.template.files);
            if (Object.keys(adorableFromTemplate).length > 0) {
              await this.writeKitAdorableFiles(kit.id, adorableFromTemplate);
              if (Object.keys(docFiles).length === 0) {
                migratedCount++;
              }
              console.log(`[Kit Migration] Extracted ${Object.keys(adorableFromTemplate).length} .adorable files from template for kit "${kit.name}" (${kit.id})`);
            }
          }
        } else {
          skippedCount++;
        }

        // 3. Migrate template files to disk if not already done
        if (kit.template && !kit.template.storedOnDisk && kit.template.files && Object.keys(kit.template.files).length > 0) {
          const hasTemplate = await this.hasTemplateFiles(kit.id);
          if (!hasTemplate) {
            // Write template files to disk (without .adorable — those go in their own dir)
            const templateWithoutAdorable = this.removeAdorableFromTemplate(kit.template.files);
            if (Object.keys(templateWithoutAdorable).length > 0) {
              await this.writeKitTemplateFiles(kit.id, templateWithoutAdorable);
              templateMigratedCount++;
              console.log(`[Kit Migration] Migrated template files to disk for kit "${kit.name}" (${kit.id})`);
            }
          }

          // Mark as stored on disk and clear files from DB JSON
          kit.template.storedOnDisk = true;
          kit.template.files = {};
          settingsChanged = true;
        }
      }

      // Save settings if we changed any kit's template
      if (settingsChanged) {
        const updatedSettings = updateKitsInSettings(settings, kits);
        await prisma.user.update({
          where: { id: user.id },
          data: { settings: JSON.stringify(updatedSettings) }
        });
        console.log(`[Kit Migration] Updated DB settings for user ${user.id} (cleared template files)`);
      }
    }

    if (migratedCount > 0 || skippedCount > 0 || templateMigratedCount > 0) {
      console.log(`[Kit Migration] Done: ${migratedCount} .adorable migrated, ${templateMigratedCount} templates migrated, ${skippedCount} already on disk`);
    }
  }
}

export const kitFsService = new KitFsService();
