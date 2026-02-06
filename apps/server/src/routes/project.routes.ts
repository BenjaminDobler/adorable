import express from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { prisma } from '../db/prisma';
import { authenticate } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { SITES_DIR, PORT } from '../config';
import { containerRegistry } from '../providers/container/container-registry';

const router = express.Router();

router.use(authenticate);

router.get('/', async (req: any, res) => {
  const user = req.user;
  try {
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      select: { name: true, id: true, updatedAt: true, thumbnail: true },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

router.post('/', async (req: any, res) => {
  const { name, files, id, thumbnail, messages, figmaImports } = req.body;
  const user = req.user;

  console.log(`[Save Project] Request for '${name}' (ID: ${id}) by ${user.email}`);

  if (!name || !files) {
    return res.status(400).json({ error: 'Name and files are required' });
  }

  try {
    let project;

    // Message operations for both create and update
    const messageCreateData = messages ? messages.map((m: any) => ({
      role: m.role,
      text: m.text,
      files: m.files ? JSON.stringify(m.files) : undefined,
      usage: m.usage ? JSON.stringify(m.usage) : undefined,
      timestamp: m.timestamp
    })) : [];

    if (id && id !== 'new-project' && id !== 'new') {
      // Update existing project
      console.log(`[Save Project] Updating existing project ${id}`);
      project = await prisma.project.update({
        where: { id: id, userId: user.id },
        data: {
          name,
          files: JSON.stringify(files),
          thumbnail,
          figmaImports: figmaImports ? JSON.stringify(figmaImports) : undefined,
          messages: messages ? {
            deleteMany: {}, // Clear old messages
            create: messageCreateData
          } : undefined
        }
      });
    } else {
      // Create new project
      console.log(`[Save Project] Creating new project`);
      project = await prisma.project.create({
        data: {
          name,
          files: JSON.stringify(files),
          userId: user.id,
          thumbnail,
          figmaImports: figmaImports ? JSON.stringify(figmaImports) : undefined,
          messages: {
            create: messageCreateData
          }
        }
      });
    }
    console.log(`[Save Project] Success. Project ID: ${project.id}`);
    res.json(project);
  } catch (error) {
    console.error('[Save Project] Error:', error);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

router.get('/:id', async (req: any, res) => {
  const user = req.user;
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: user.id },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    res.json({
        ...project,
        files: JSON.parse(project.files),
        figmaImports: project.figmaImports ? JSON.parse(project.figmaImports) : [],
        messages: project.messages.map(m => ({
          ...m,
          files: m.files ? JSON.parse(m.files) : undefined,
          usage: m.usage ? JSON.parse(m.usage) : undefined
        }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load project' });
  }
});

router.delete('/:id', async (req: any, res) => {
    const user = req.user;
    try {
      await prisma.project.delete({
        where: { id: req.params.id, userId: user.id }
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete project' });
    }
});

router.post('/:id/clone', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;
  const { name: customName, includeMessages } = req.body;

  try {
    // Fetch the source project with messages if needed
    const sourceProject = await prisma.project.findFirst({
      where: { id, userId: user.id },
      include: includeMessages ? {
        messages: {
          orderBy: { timestamp: 'asc' }
        }
      } : undefined
    });

    if (!sourceProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate clone name
    const cloneName = customName || `${sourceProject.name} (Copy)`;

    // Prepare message data if including messages
    const messageCreateData = includeMessages && sourceProject.messages
      ? sourceProject.messages.map((m: any) => ({
          role: m.role,
          text: m.text,
          files: m.files,
          usage: m.usage,
          timestamp: m.timestamp
        }))
      : [];

    // Create the cloned project
    const clonedProject = await prisma.project.create({
      data: {
        name: cloneName,
        files: sourceProject.files,
        thumbnail: sourceProject.thumbnail,
        figmaImports: sourceProject.figmaImports,
        userId: user.id,
        messages: messageCreateData.length > 0 ? {
          create: messageCreateData
        } : undefined
      }
    });

    console.log(`[Clone Project] Cloned '${sourceProject.name}' to '${cloneName}' (ID: ${clonedProject.id})${includeMessages ? ' with messages' : ''}`);
    res.json(clonedProject);
  } catch (error) {
    console.error('[Clone Project] Error:', error);
    res.status(500).json({ error: 'Failed to clone project' });
  }
});

router.post('/publish/:id', async (req: any, res) => {
  const { id } = req.params;
  const { files } = req.body;
  const user = req.user;

  try {
    const project = await prisma.project.findFirst({
      where: { id, userId: user.id }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Check if user has an active Docker container
    const manager = containerRegistry.getManager(user.id);
    const isDockerMode = manager.isRunning();

    const sitePath = path.join(SITES_DIR, id);
    await fs.rm(sitePath, { recursive: true, force: true });
    await fs.mkdir(sitePath, { recursive: true });

    if (isDockerMode) {
      // Docker mode: run build in container and copy dist files
      console.log(`[Publish] Docker mode - Building project ${id} for user ${user.id}...`);

      const buildResult = await manager.exec(['npm', 'run', 'build'], '/app');

      if (buildResult.exitCode !== 0) {
        console.error('[Publish] Build failed:', buildResult.output);
        return res.status(500).json({
          error: 'Build failed',
          details: buildResult.output.slice(-1000)
        });
      }

      console.log('[Publish] Build successful, copying files...');

      // The built files are at storage/projects/{userId}/dist/...
      const userProjectPath = path.join(process.cwd(), 'storage', 'projects', user.id);
      const distRoot = path.join(userProjectPath, 'dist');

      // Find the folder containing index.html (Angular 17+ uses dist/{project-name}/browser)
      const distPath = await findWebRoot(distRoot);
      if (!distPath) {
        return res.status(500).json({ error: 'Build output not found - no index.html in dist folder' });
      }

      console.log(`[Publish] Using dist path: ${distPath}`);
      await copyDir(distPath, sitePath);

      // Fix base href in index.html for published sites
      const indexPath = path.join(sitePath, 'index.html');
      try {
        let html = await fs.readFile(indexPath, 'utf-8');
        html = projectService.fixBaseHref(html);
        await fs.writeFile(indexPath, html);
      } catch (e) {
        console.warn('[Publish] Could not fix base href:', e);
      }
    } else {
      // WebContainer mode: save source files directly
      console.log(`[Publish] WebContainer mode - Saving files for project ${id}`);
      await projectService.saveFilesToDisk(sitePath, files);
    }

    const publicUrl = `http://localhost:${PORT}/sites/${id}/index.html`;
    console.log(`[Publish] Published at: ${publicUrl}`);
    res.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Publish error:', error);
    res.status(500).json({ error: error.message || 'Failed to publish site' });
  }
});

// Helper to find the folder containing index.html
async function findWebRoot(currentPath: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    // Check if this folder has index.html
    if (entries.some(e => e.name === 'index.html')) {
      return currentPath;
    }

    // Recursively search subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const result = await findWebRoot(path.join(currentPath, entry.name));
        if (result) return result;
      }
    }
  } catch (e) {
    // Directory doesn't exist or can't be read
  }
  return null;
}

// Helper to recursively copy a directory
async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export const projectRouter = router;
