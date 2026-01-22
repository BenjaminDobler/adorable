import express from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { authenticate } from '../middleware/auth';
import { SkillRegistry } from '../providers/skills/skill-registry';
import { MemoryFileSystem } from '../providers/filesystem/memory-filesystem';
import { prisma } from '../db/prisma';

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
      const project = await prisma.project.findFirst({
        where: { id: projectId as string, userId: user.id }
      });

      if (project && project.files) {
        try {
          const files = JSON.parse(project.files);
          const flattened = flattenFiles(files);
          fs = new MemoryFileSystem(flattened);
        } catch (e) {
          console.warn('Failed to parse project files for skills discovery', e);
        }
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

export const skillsRouter = router;
