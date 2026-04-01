import { FileSystemInterface, Skill, SkillReference } from '../types';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface ClaudeCommand {
  name: string;
  content: string;
  hasArguments: boolean;
}

/**
 * Discover .claude/commands/*.md files and return them as structured commands.
 */
export async function discoverClaudeCommands(targetFs: FileSystemInterface, baseDir: string): Promise<ClaudeCommand[]> {
  const commands: ClaudeCommand[] = [];
  try {
    const entries = await targetFs.listDir(baseDir);
    for (const entry of entries) {
      if (entry.endsWith('/') || !entry.endsWith('.md')) continue;
      const filePath = `${baseDir}/${entry}`;
      try {
        const content = await targetFs.readFile(filePath);
        if (!content?.trim()) continue;
        const name = entry.replace(/\.md$/, '');
        commands.push({
          name,
          content: content.trim(),
          hasArguments: content.includes('$ARGUMENTS')
        });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Directory doesn't exist — ignore
  }
  return commands;
}

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  constructor() {}

  async discover(targetFs: FileSystemInterface, userId?: string): Promise<Skill[]> {
    this.skills.clear();

    // 1. System Skills (Built-in)
    // Try both dev (source) and prod (dist) paths
    const devPath = path.join(process.cwd(), 'apps/server/src/assets/skills');
    const prodPath = path.join(__dirname, 'assets/skills');
    
    await this.scanLocalDir(devPath);
    await this.scanLocalDir(prodPath);

    // 2. User Skills
    if (userId) {
       const userSkillsPath = path.join(process.cwd(), 'storage', 'users', userId, 'skills');
       await this.scanLocalDir(userSkillsPath);
    }

    // 3. Project Skills (via FileSystemInterface)
    // .adorable/skills and .claude/skills
    await this.scanProjectDir(targetFs, '.adorable/skills');
    await this.scanProjectDir(targetFs, '.claude/skills');

    return Array.from(this.skills.values());
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  private async scanLocalDir(baseDir: string) {
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = path.join(baseDir, entry.name);
          const skillPath = path.join(skillDir, 'SKILL.md');
          try {
            const content = await fs.readFile(skillPath, 'utf-8');
            const references = await this.loadLocalReferences(skillDir);
            this.parseAndRegister(content, skillPath, references);
          } catch (e) {
            // Skip if no SKILL.md
          }
        }
      }
    } catch (e) {
      // Ignore if dir doesn't exist
    }
  }

  /**
   * Import Claude Code commands (.claude/commands/*.md) as skills.
   * Each .md file becomes a skill named after the filename (without extension).
   * Files with frontmatter are parsed normally; plain markdown files get a
   * generated name and description.
   */
  private async scanClaudeCommands(targetFs: FileSystemInterface, baseDir: string) {
    try {
      const entries = await targetFs.listDir(baseDir);
      for (const entry of entries) {
        if (entry.endsWith('/') || !entry.endsWith('.md')) continue;
        const filePath = `${baseDir}/${entry}`;
        try {
          const content = await targetFs.readFile(filePath);
          if (!content?.trim()) continue;

          // If the file has frontmatter, parse it as a regular skill
          if (content.startsWith('---\n')) {
            this.parseAndRegister(content, filePath);
          } else {
            // Plain markdown command — register with filename-derived name
            const name = entry.replace(/\.md$/, '');
            if (!this.skills.has(name)) {
              this.skills.set(name, {
                name,
                description: `Claude command: ${name}`,
                instructions: content.trim(),
                triggers: [],
                sourcePath: filePath,
                references: []
              });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Directory doesn't exist — ignore
    }
  }

  private async scanProjectDir(targetFs: FileSystemInterface, baseDir: string) {
    try {
      // listDir returns full paths or names?
      // Our listDir impl returns "name/" for dirs.
      // We need to list the baseDir.
      const entries = await targetFs.listDir(baseDir);

      for (const entry of entries) {
        if (entry.endsWith('/')) {
          // It's a directory
          const skillDirName = entry.replace(/\/$/, ''); // remove trailing slash
          const skillDir = `${baseDir}/${skillDirName}`;
          const skillPath = `${skillDir}/SKILL.md`;
          try {
            const content = await targetFs.readFile(skillPath);
            const references = await this.loadProjectReferences(targetFs, skillDir);
            this.parseAndRegister(content, skillPath, references);
          } catch (e) {
            // Skip
          }
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  private parseAndRegister(content: string, sourcePath: string, references: SkillReference[] = []) {
    try {
      // Simple Frontmatter Parser
      // We can't rely on generic split because "---" might appear in content.
      // Frontmatter must be at the start.
      const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

      if (match) {
        const yamlStr = match[1];
        const body = match[2];
        const meta: any = yaml.load(yamlStr);

        if (meta && meta.name) {
          // Parse allowed-tools from space-delimited string to array
          let allowedTools: string[] | undefined;
          if (meta['allowed-tools']) {
            allowedTools = meta['allowed-tools'].split(/\s+/).filter(Boolean);
          }

          this.skills.set(meta.name, {
            name: meta.name,
            description: meta.description || 'No description provided',
            instructions: body.trim(),
            triggers: meta.triggers || [],
            sourcePath,
            // skills.sh compatible fields
            license: meta.license,
            compatibility: meta.compatibility,
            metadata: meta.metadata,
            allowedTools,
            references
          });
        }
      }
    } catch (e) {
      console.warn(`Failed to parse skill at ${sourcePath}`, e);
    }
  }

  /**
   * Load reference files from a skill's references/ directory
   */
  private async loadLocalReferences(skillDir: string): Promise<SkillReference[]> {
    const references: SkillReference[] = [];
    const refsDir = path.join(skillDir, 'references');

    try {
      const entries = await fs.readdir(refsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const refPath = path.join(refsDir, entry.name);
          try {
            const content = await fs.readFile(refPath, 'utf-8');
            references.push({
              name: entry.name,
              path: refPath,
              content
            });
          } catch (e) {
            // Skip unreadable files
          }
        }
      }
    } catch (e) {
      // No references directory or not readable
    }

    return references;
  }

  /**
   * Load reference files from a skill's references/ directory via FileSystemInterface
   */
  private async loadProjectReferences(targetFs: FileSystemInterface, skillDir: string): Promise<SkillReference[]> {
    const references: SkillReference[] = [];
    const refsDir = `${skillDir}/references`;

    try {
      const entries = await targetFs.listDir(refsDir);
      for (const entry of entries) {
        // Skip directories (they end with /)
        if (!entry.endsWith('/')) {
          const refPath = `${refsDir}/${entry}`;
          try {
            const content = await targetFs.readFile(refPath);
            references.push({
              name: entry,
              path: refPath,
              content
            });
          } catch (e) {
            // Skip unreadable files
          }
        }
      }
    } catch (e) {
      // No references directory or not readable
    }

    return references;
  }
}
