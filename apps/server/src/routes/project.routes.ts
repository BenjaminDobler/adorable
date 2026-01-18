import express from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { prisma } from '../db/prisma';
import { authenticate } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { SITES_DIR, PORT } from '../config';

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
  const { name, files, id, thumbnail, messages } = req.body;
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

router.post('/publish/:id', async (req: any, res) => {
  const { id } = req.params;
  const { files } = req.body;
  const user = req.user;

  try {
    const project = await prisma.project.findFirst({
      where: { id, userId: user.id }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const sitePath = path.join(SITES_DIR, id);
    await fs.mkdir(sitePath, { recursive: true });
    
    // Clear existing
    await fs.rm(sitePath, { recursive: true, force: true });
    await fs.mkdir(sitePath, { recursive: true });

    await projectService.saveFilesToDisk(sitePath, files);

    const publicUrl = `http://localhost:${PORT}/sites/${id}/index.html`;
    res.json({ url: publicUrl });
  } catch (error) {
    console.error('Publish error:', error);
    res.status(500).json({ error: 'Failed to publish site' });
  }
});

export const projectRouter = router;
