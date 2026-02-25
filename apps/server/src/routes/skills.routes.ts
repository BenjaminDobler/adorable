import express from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { authenticate } from '../middleware/auth';
import { SkillRegistry } from '../providers/skills/skill-registry';
import { MemoryFileSystem } from '../providers/filesystem/memory-filesystem';
import { prisma } from '../db/prisma';
import { projectFsService } from '../services/project-fs.service';

const router = express.Router();

router.use(authenticate);

// Helper to flatten WebContainer files for MemoryFileSystem
function flattenFiles(structure: any, prefix = ''): Record<string, string> {
  const map: Record<string, string> = {};
  for (const key in structure) {
    const node = structure[key];
    const path = prefix + key;
    if (node.file) {
      map[path] = node.file.contents;
    } else if (node.directory) {
      Object.assign(map, flattenFiles(node.directory, path + '/'));
    }
  }
  return map;
}

// List available skills (System + User [+ Project])
router.get('/', async (req: any, res) => {
  const user = req.user;
  const { projectId } = req.query;

  try {
    const registry = new SkillRegistry();
    let fs = new MemoryFileSystem({}); // Empty FS for system/user only

    if (projectId) {
      try {
        // Read project files from disk
        const existsOnDisk = await projectFsService.projectExistsOnDisk(projectId as string);
        if (existsOnDisk) {
          const flattened = await projectFsService.readProjectFilesFlat(projectId as string);
          fs = new MemoryFileSystem(flattened);
        } else {
          // Fallback to DB for legacy projects
          const project = await prisma.project.findFirst({
            where: { id: projectId as string, userId: user.id }
          });

          if (project && project.files) {
            const files = JSON.parse(project.files);
            const flattened = flattenFiles(files);
            fs = new MemoryFileSystem(flattened);
          }
        }
      } catch (e) {
        console.warn('Failed to read project files for skills discovery', e);
      }
    }

    const skills = await registry.discover(fs, user.id);
    res.json(skills);
  } catch (error: any) {
    console.error('Failed to list skills:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save a User Skill
router.post('/', async (req: any, res) => {
    const user = req.user;
    const { name, description, instructions, triggers } = req.body;

    if (!name || !instructions) {
        return res.status(400).json({ error: 'Name and instructions are required' });
    }

    try {
        const userSkillsDir = path.join(process.cwd(), 'storage', 'users', user.id, 'skills', name);
        await fs.mkdir(userSkillsDir, { recursive: true });

        const yamlContent = [
            '---',
            `name: ${name}`,
            `description: ${description || ''}`,
            `triggers: [${(triggers || []).map((t: string) => `"${t}"`).join(', ')}]`,
            '---',
            instructions
        ].join('\n');

        await fs.writeFile(path.join(userSkillsDir, 'SKILL.md'), yamlContent);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a User Skill
router.delete('/:name', async (req: any, res) => {
    const user = req.user;
    const { name } = req.params;

    try {
        const skillPath = path.join(process.cwd(), 'storage', 'users', user.id, 'skills', name);
        await fs.rm(skillPath, { recursive: true, force: true });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Parse a GitHub repo string into owner/repo/path components
 * Supports: owner/repo, owner/repo/path, https://github.com/owner/repo, etc.
 */
function parseGitHubRepo(input: string): { owner: string; repo: string; path?: string } | null {
    // Remove https://github.com/ prefix if present
    let cleaned = input.replace(/^https?:\/\/github\.com\//, '');
    // Remove .git suffix if present
    cleaned = cleaned.replace(/\.git$/, '');
    // Remove /tree/main or /tree/master paths
    cleaned = cleaned.replace(/\/tree\/[^/]+/, '');

    const parts = cleaned.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    return {
        owner: parts[0],
        repo: parts[1],
        path: parts.length > 2 ? parts.slice(2).join('/') : undefined
    };
}

/**
 * Fetch a file from GitHub using raw content URL
 */
async function fetchGitHubFile(owner: string, repo: string, filePath: string, branch = 'main'): Promise<string> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    const response = await fetch(url);
    if (!response.ok) {
        // Try 'master' branch if 'main' fails
        if (branch === 'main') {
            return fetchGitHubFile(owner, repo, filePath, 'master');
        }
        throw new Error(`Failed to fetch ${filePath}: ${response.statusText}`);
    }
    return response.text();
}

/**
 * List contents of a GitHub directory using the API
 */
async function listGitHubDir(owner: string, repo: string, dirPath: string, branch = 'main'): Promise<{ name: string; type: string; path: string }[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;
    const response = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!response.ok) {
        if (branch === 'main') {
            return listGitHubDir(owner, repo, dirPath, 'master');
        }
        throw new Error(`Failed to list ${dirPath}: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
function parseSkillFrontmatter(content: string): { name: string; description: string } | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const lines = match[1].split('\n');
    let name = '';
    let description = '';

    for (const line of lines) {
        const nameMatch = line.match(/^name:\s*(.+)/);
        const descMatch = line.match(/^description:\s*(.+)/);
        if (nameMatch) name = nameMatch[1].trim();
        if (descMatch) description = descMatch[1].trim();
    }

    return name ? { name, description } : null;
}

// List skills available in a GitHub repository
router.get('/list-remote', async (req: any, res) => {
    const { repo } = req.query;

    if (!repo) {
        return res.status(400).json({ error: 'repo parameter is required' });
    }

    try {
        const parsed = parseGitHubRepo(repo as string);
        if (!parsed) {
            return res.status(400).json({ error: 'Invalid repository format' });
        }

        const { owner, repo: repoName, path: subPath } = parsed;

        // Try common skill locations
        const skillLocations = subPath
            ? [subPath]
            : ['skills', '.agents/skills', '.claude/skills', '.'];

        const foundSkills: { name: string; description: string; path: string }[] = [];

        for (const location of skillLocations) {
            try {
                const contents = await listGitHubDir(owner, repoName, location);

                for (const item of contents) {
                    if (item.type === 'dir') {
                        // Check if directory contains SKILL.md
                        try {
                            const skillContent = await fetchGitHubFile(owner, repoName, `${item.path}/SKILL.md`);
                            const meta = parseSkillFrontmatter(skillContent);
                            if (meta) {
                                foundSkills.push({
                                    name: meta.name,
                                    description: meta.description,
                                    path: item.path
                                });
                            }
                        } catch {
                            // No SKILL.md in this directory
                        }
                    }
                }

                if (foundSkills.length > 0) break; // Found skills, stop searching
            } catch {
                // Location doesn't exist, try next
            }
        }

        res.json({ skills: foundSkills });
    } catch (error: any) {
        console.error('Failed to list remote skills:', error);
        res.status(500).json({ error: error.message });
    }
});

// Install skills from a GitHub repository
router.post('/install', async (req: any, res) => {
    const user = req.user;
    const { repo, skillName, global: installGlobal } = req.body;

    if (!repo) {
        return res.status(400).json({ error: 'repo is required' });
    }

    try {
        const parsed = parseGitHubRepo(repo);
        if (!parsed) {
            return res.status(400).json({ error: 'Invalid repository format' });
        }

        const { owner, repo: repoName, path: subPath } = parsed;

        // Determine where to install
        const targetDir = installGlobal
            ? path.join(process.cwd(), 'storage', 'users', user.id, 'skills')
            : path.join(process.cwd(), 'storage', 'users', user.id, 'skills');

        // Try common skill locations
        const skillLocations = subPath
            ? [subPath]
            : ['skills', '.agents/skills', '.claude/skills', '.'];

        const installed: string[] = [];

        for (const location of skillLocations) {
            try {
                const contents = await listGitHubDir(owner, repoName, location);

                for (const item of contents) {
                    if (item.type === 'dir') {
                        // If skillName specified, only install that one
                        if (skillName && !item.name.includes(skillName)) continue;

                        try {
                            // Fetch SKILL.md
                            const skillContent = await fetchGitHubFile(owner, repoName, `${item.path}/SKILL.md`);
                            const meta = parseSkillFrontmatter(skillContent);
                            if (!meta) continue;

                            // Create skill directory
                            const skillDir = path.join(targetDir, meta.name);
                            await fs.mkdir(skillDir, { recursive: true });

                            // Write SKILL.md
                            await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);

                            // Try to fetch references/ directory
                            try {
                                const refs = await listGitHubDir(owner, repoName, `${item.path}/references`);
                                const refsDir = path.join(skillDir, 'references');
                                await fs.mkdir(refsDir, { recursive: true });

                                for (const ref of refs) {
                                    if (ref.type === 'file') {
                                        const refContent = await fetchGitHubFile(owner, repoName, ref.path);
                                        await fs.writeFile(path.join(refsDir, ref.name), refContent);
                                    }
                                }
                            } catch {
                                // No references directory
                            }

                            installed.push(meta.name);
                        } catch (e) {
                            console.warn(`Failed to install skill from ${item.path}:`, e);
                        }
                    }
                }

                if (installed.length > 0) break; // Found and installed skills
            } catch {
                // Location doesn't exist
            }
        }

        if (installed.length === 0) {
            return res.status(404).json({ error: 'No skills found in repository' });
        }

        res.json({ success: true, installed });
    } catch (error: any) {
        console.error('Failed to install skills:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Export a user skill (SKILL.md + reference files)
 * GET /api/skills/:name/export
 */
router.get('/:name/export', async (req: any, res) => {
  const user = req.user;
  const { name } = req.params;

  try {
    const skillDir = path.join(process.cwd(), 'storage', 'users', user.id, 'skills', name);

    // Read SKILL.md
    let skillMd: string;
    try {
      skillMd = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf-8');
    } catch {
      return res.status(404).json({ error: `Skill "${name}" not found` });
    }

    // Read reference files if they exist
    const references: Record<string, string> = {};
    const refsDir = path.join(skillDir, 'references');
    try {
      const refFiles = await fs.readdir(refsDir);
      for (const refFile of refFiles) {
        const refPath = path.join(refsDir, refFile);
        const stat = await fs.stat(refPath);
        if (stat.isFile()) {
          references[refFile] = await fs.readFile(refPath, 'utf-8');
        }
      }
    } catch {
      // No references directory — that's fine
    }

    res.json({ name, skillMd, references });
  } catch (error: any) {
    console.error('Export skill error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Import a skill from exported data
 * POST /api/skills/import
 */
router.post('/import', async (req: any, res) => {
  const user = req.user;
  const { name, skillMd, references } = req.body;

  if (!name || !skillMd) {
    return res.status(400).json({ error: 'name and skillMd are required' });
  }

  try {
    const skillDir = path.join(process.cwd(), 'storage', 'users', user.id, 'skills', name);
    await fs.mkdir(skillDir, { recursive: true });

    // Write SKILL.md
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd);

    // Write reference files if provided
    if (references && Object.keys(references).length > 0) {
      const refsDir = path.join(skillDir, 'references');
      await fs.mkdir(refsDir, { recursive: true });
      for (const [fileName, content] of Object.entries(references)) {
        await fs.writeFile(path.join(refsDir, fileName), content as string);
      }
    }

    res.json({ success: true, name });
  } catch (error: any) {
    console.error('Import skill error:', error);
    res.status(500).json({ error: error.message });
  }
});

export const skillsRouter = router;
