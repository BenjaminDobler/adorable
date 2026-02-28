import express from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { prisma } from '../db/prisma';
import { authenticate } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { projectFsService } from '../services/project-fs.service';
import { SITES_DIR, PORT } from '../config';
import { containerRegistry } from '../providers/container/container-registry';

const router = express.Router();

router.use(authenticate);

router.get('/', async (req: any, res) => {
  const user = req.user;
  try {
    // Find teams the user belongs to
    const memberships = await prisma.teamMember.findMany({
      where: { userId: user.id },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);

    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { userId: user.id },
          ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        ],
      },
      select: { name: true, id: true, updatedAt: true, thumbnail: true, teamId: true, cloudProjectId: true, cloudCommitSha: true, cloudLastSyncAt: true },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

router.post('/', async (req: any, res) => {
  const { name, files, id, thumbnail, messages, figmaImports, selectedKitId, cloudProjectId, cloudCommitSha, cloudLastSyncAt } = req.body;
  const user = req.user;

  console.log(`[Save Project] Request for '${name}' (ID: ${id}) by ${user.email}, files keys: ${files ? Object.keys(files).join(', ') : 'none'}`);

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    let project;

    // Message operations for both create and update
    const messageCreateData = messages ? messages.map((m: any) => ({
      role: m.role,
      text: m.text,
      files: m.files ? JSON.stringify(m.files) : undefined,
      commitSha: m.commitSha || undefined,
      usage: m.usage ? JSON.stringify(m.usage) : undefined,
      model: m.model || undefined,
      timestamp: m.timestamp
    })) : [];

    // Check if this project already exists in DB (supports client-generated IDs)
    const existingProject = id ? await prisma.project.findFirst({ where: { id, userId: user.id } }) : null;

    if (existingProject) {
      // Update existing project
      console.log(`[Save Project] Updating existing project ${id}`);

      // Only append new messages instead of deleting and recreating all
      let messageOp: any = undefined;
      if (messages) {
        const existingCount = await prisma.chatMessage.count({ where: { projectId: id } });
        const newMessages = messageCreateData.slice(existingCount);
        if (newMessages.length > 0 || existingCount > messages.length) {
          if (existingCount > messages.length) {
            // Messages were removed (e.g. conversation reset) — full replace
            messageOp = { deleteMany: {}, create: messageCreateData };
          } else {
            messageOp = { create: newMessages };
          }
        }
      }

      project = await prisma.project.update({
        where: { id: id, userId: user.id },
        data: {
          name,
          // No longer store files in DB — they go to disk
          thumbnail,
          figmaImports: figmaImports ? JSON.stringify(figmaImports) : undefined,
          selectedKitId: selectedKitId !== undefined ? selectedKitId : undefined,
          messages: messageOp,
          // Cloud sync fields
          cloudProjectId: cloudProjectId !== undefined ? cloudProjectId : undefined,
          cloudCommitSha: cloudCommitSha !== undefined ? cloudCommitSha : undefined,
          cloudLastSyncAt: cloudLastSyncAt !== undefined ? (cloudLastSyncAt ? new Date(cloudLastSyncAt) : null) : undefined,
        }
      });
    } else {
      // Create new project (use client-supplied ID if provided)
      console.log(`[Save Project] Creating new project${id ? ` with ID ${id}` : ''}`);
      project = await prisma.project.create({
        data: {
          ...(id ? { id } : {}),
          name,
          userId: user.id,
          thumbnail,
          figmaImports: figmaImports ? JSON.stringify(figmaImports) : undefined,
          selectedKitId: selectedKitId || undefined,
          messages: {
            create: messageCreateData
          }
        }
      });
    }

    // Write files to disk if provided
    if (files && Object.keys(files).length > 0) {
      console.log(`[Save Project] Writing files to disk for ${project.id}`);
      await projectFsService.writeProjectFiles(project.id, files);

      // Git commit on save
      try {
        const { gitService } = await import('../services/git.service');
        const projectPath = projectFsService.getProjectPath(project.id);
        await gitService.initRepo(projectPath);
        await gitService.commit(projectPath, `Save: ${name}`);
      } catch (e) {
        console.warn('[Save Project] Git commit failed (non-fatal):', e);
      }
    }

    // Symlink kit docs into project directory when kit is assigned/changed
    if (selectedKitId !== undefined) {
      try {
        await projectFsService.linkKit(project.id, selectedKitId || null);
      } catch (e) {
        console.warn('[Save Project] Kit symlink failed (non-fatal):', e);
      }
    }

    console.log(`[Save Project] Success. Project ID: ${project.id}`);
    res.json(project);
  } catch (error) {
    console.error('[Save Project] Error:', error);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// ---- Cloud Sync Endpoints ----
// These must be defined BEFORE /:id routes to avoid Express matching "sync-status" as an :id param.

/**
 * GET /api/projects/sync-status
 * Returns all projects with their current git HEAD SHA for sync comparison.
 */
router.get('/sync-status', async (req: any, res) => {
  const user = req.user;
  try {
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, updatedAt: true, thumbnail: true }
    });

    const { gitService } = await import('../services/git.service');
    const results = await Promise.all(
      projects.map(async (p) => {
        const projectPath = projectFsService.getProjectPath(p.id);
        const headSha = await gitService.getHeadSha(projectPath);
        return {
          id: p.id,
          name: p.name,
          updatedAt: p.updatedAt.toISOString(),
          thumbnail: p.thumbnail,
          headSha,
        };
      })
    );

    res.json(results);
  } catch (error) {
    console.error('[Sync Status] Error:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

/**
 * POST /api/projects/import
 * Import/export a project for desktop sync. Returns full project data + files + messages + HEAD SHA.
 */
router.post('/import', async (req: any, res) => {
  const user = req.user;
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
          select: {
            id: true,
            role: true,
            text: true,
            usage: true,
            model: true,
            commitSha: true,
            timestamp: true,
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Read files from disk (with lazy migration fallback from DB)
    let files: any = {};
    const existsOnDisk = await projectFsService.projectExistsOnDisk(project.id);
    if (existsOnDisk) {
      files = await projectFsService.readProjectFiles(project.id);
    } else if (project.files) {
      // Lazy migration: files exist in DB but not on disk
      console.log(`[Import] Lazy migrating files to disk for ${project.id}`);
      files = JSON.parse(project.files);
      await projectFsService.writeProjectFiles(project.id, files);
      await prisma.project.update({
        where: { id: project.id },
        data: { files: null }
      });
    }

    // Get HEAD SHA
    const { gitService } = await import('../services/git.service');
    const projectPath = projectFsService.getProjectPath(project.id);
    const headSha = await gitService.getHeadSha(projectPath);

    res.json({
      project: {
        id: project.id,
        name: project.name,
        thumbnail: project.thumbnail,
        selectedKitId: project.selectedKitId,
        figmaImports: project.figmaImports ? JSON.parse(project.figmaImports) : [],
      },
      files,
      messages: project.messages.map(m => ({
        ...m,
        usage: m.usage ? JSON.parse(m.usage) : undefined,
        model: m.model || undefined,
      })),
      headSha,
    });
  } catch (error) {
    console.error('[Import] Error:', error);
    res.status(500).json({ error: 'Failed to import project' });
  }
});

/**
 * POST /api/projects/:id/push
 * Desktop pushes local changes to cloud. Writes files, commits, returns new HEAD SHA.
 */
router.post('/:id/push', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;
  const { files, messages, name, thumbnail, selectedKitId } = req.body;

  try {
    const project = await prisma.project.findFirst({
      where: { id, userId: user.id }
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Update project metadata
    const messageCreateData = messages ? messages.map((m: any) => ({
      role: m.role,
      text: m.text,
      files: m.files ? JSON.stringify(m.files) : undefined,
      commitSha: m.commitSha || undefined,
      usage: m.usage ? JSON.stringify(m.usage) : undefined,
      model: m.model || undefined,
      timestamp: m.timestamp,
    })) : [];

    // Full replace messages on push to keep in sync
    await prisma.project.update({
      where: { id },
      data: {
        name: name || project.name,
        thumbnail: thumbnail !== undefined ? thumbnail : project.thumbnail,
        selectedKitId: selectedKitId !== undefined ? selectedKitId : project.selectedKitId,
        messages: messages ? { deleteMany: {}, create: messageCreateData } : undefined,
      }
    });

    // Write files to disk
    if (files && Object.keys(files).length > 0) {
      await projectFsService.writeProjectFiles(id, files);
    }

    // Git commit
    const { gitService } = await import('../services/git.service');
    const projectPath = projectFsService.getProjectPath(id);
    await gitService.initRepo(projectPath);
    await gitService.commit(projectPath, `Cloud sync push: ${name || project.name}`);

    const headSha = await gitService.getHeadSha(projectPath);
    res.json({ headSha });
  } catch (error) {
    console.error('[Push] Error:', error);
    res.status(500).json({ error: 'Failed to push project' });
  }
});

/**
 * POST /api/projects/:id/pull
 * Desktop pulls latest from cloud. Returns current files + messages + HEAD SHA.
 */
router.post('/:id/pull', async (req: any, res) => {
  const user = req.user;
  const { id } = req.params;

  try {
    const project = await prisma.project.findFirst({
      where: { id, userId: user.id },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
          select: {
            id: true,
            role: true,
            text: true,
            usage: true,
            model: true,
            commitSha: true,
            timestamp: true,
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Read files from disk (with lazy migration fallback from DB)
    let files: any = {};
    const existsOnDisk = await projectFsService.projectExistsOnDisk(project.id);
    if (existsOnDisk) {
      files = await projectFsService.readProjectFiles(project.id);
    } else if (project.files) {
      console.log(`[Pull] Lazy migrating files to disk for ${project.id}`);
      files = JSON.parse(project.files);
      await projectFsService.writeProjectFiles(project.id, files);
      await prisma.project.update({
        where: { id: project.id },
        data: { files: null }
      });
    }

    // Get HEAD SHA
    const { gitService } = await import('../services/git.service');
    const projectPath = projectFsService.getProjectPath(project.id);
    const headSha = await gitService.getHeadSha(projectPath);

    res.json({
      files,
      messages: project.messages.map(m => ({
        ...m,
        usage: m.usage ? JSON.parse(m.usage) : undefined,
        model: m.model || undefined,
      })),
      name: project.name,
      thumbnail: project.thumbnail,
      headSha,
    });
  } catch (error) {
    console.error('[Pull] Error:', error);
    res.status(500).json({ error: 'Failed to pull project' });
  }
});

router.get('/:id', async (req: any, res) => {
  const user = req.user;
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: user.id },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
          select: {
            id: true,
            role: true,
            text: true,
            usage: true,
            model: true,
            commitSha: true,
            timestamp: true,
          }
        }
      }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Read files from disk
    let files: any = {};
    const existsOnDisk = await projectFsService.projectExistsOnDisk(project.id);

    if (existsOnDisk) {
      files = await projectFsService.readProjectFiles(project.id);
    } else if (project.files) {
      // Lazy migration: files exist in DB but not on disk
      console.log(`[Load Project] Lazy migrating files to disk for ${project.id}`);
      files = JSON.parse(project.files);
      await projectFsService.writeProjectFiles(project.id, files);
      // Clear the DB column to free space
      await prisma.project.update({
        where: { id: project.id },
        data: { files: null }
      });
    }

    res.json({
        ...project,
        files,
        figmaImports: project.figmaImports ? JSON.parse(project.figmaImports) : [],
        messages: project.messages.map(m => ({
          ...m,
          usage: m.usage ? JSON.parse(m.usage) : undefined,
          model: m.model || undefined
        }))
    });
  } catch (error) {
    console.error('[Load Project] Error:', error);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

router.delete('/:id', async (req: any, res) => {
    const user = req.user;
    try {
      await prisma.project.delete({
        where: { id: req.params.id, userId: user.id }
      });
      // Also delete files from disk
      await projectFsService.deleteProjectFiles(req.params.id);
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
          commitSha: m.commitSha,
          usage: m.usage,
          timestamp: m.timestamp
        }))
      : [];

    // Create the cloned project (no files blob)
    const clonedProject = await prisma.project.create({
      data: {
        name: cloneName,
        thumbnail: sourceProject.thumbnail,
        figmaImports: sourceProject.figmaImports,
        selectedKitId: sourceProject.selectedKitId,
        userId: user.id,
        messages: messageCreateData.length > 0 ? {
          create: messageCreateData
        } : undefined
      }
    });

    // Copy files on disk
    const sourceExists = await projectFsService.projectExistsOnDisk(id);
    if (sourceExists) {
      await projectFsService.copyProject(id, clonedProject.id);
    }

    console.log(`[Clone Project] Cloned '${sourceProject.name}' to '${cloneName}' (ID: ${clonedProject.id})${includeMessages ? ' with messages' : ''}`);
    res.json(clonedProject);
  } catch (error) {
    console.error('[Clone Project] Error:', error);
    res.status(500).json({ error: 'Failed to clone project' });
  }
});

/**
 * POST /api/projects/:id/restore
 * Restore project files to a specific git commit
 */
router.get('/:id/history', async (req: any, res) => {
  const user = req.user;
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: user.id }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { gitService } = await import('../services/git.service');
    const projectPath = projectFsService.getProjectPath(project.id);
    const log = await gitService.getLog(projectPath);

    const commits = log.all.map(entry => ({
      sha: entry.hash,
      message: entry.message,
      date: entry.date,
    }));

    res.json({ commits });
  } catch (error: any) {
    console.error('[History] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to get project history' });
  }
});

router.post('/:id/restore', async (req: any, res) => {
  const user = req.user;
  const { commitSha } = req.body;

  if (!commitSha) {
    return res.status(400).json({ error: 'commitSha is required' });
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: user.id }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Import git service lazily to avoid circular deps
    const { gitService } = await import('../services/git.service');
    const projectPath = projectFsService.getProjectPath(project.id);
    await gitService.checkout(projectPath, commitSha);

    // Read the restored files
    const files = await projectFsService.readProjectFiles(project.id);
    res.json({ success: true, files });
  } catch (error: any) {
    console.error('[Restore] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to restore version' });
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

      // The built files are at storage/projects/{projectId}/dist/...
      const projectPath = projectFsService.getProjectPath(id);
      const distRoot = path.join(projectPath, 'dist');

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
      // Fallback: save provided files directly
      console.log(`[Publish] Saving files for project ${id}`);
      if (files) {
        await projectService.saveFilesToDisk(sitePath, files);
      }
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
