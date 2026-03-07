import express from 'express';
import crypto from 'crypto';
import os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import archiver from 'archiver';
import { prisma } from '../db/prisma';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { serverConfigService } from '../services/server-config.service';
import { containerRegistry } from '../providers/container/container-registry';
import { projectFsService } from '../services/project-fs.service';
import { emailService } from '../services/email.service';
import { STORAGE_DIR } from '../config';

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(requireAdmin);

// --- Users ---

router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        emailVerified: true,
        cloudEditorAllowed: true,
        createdAt: true,
        _count: { select: { projects: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users.map(u => ({
      ...u,
      projectCount: u._count.projects,
      _count: undefined,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list users' });
  }
});

router.patch('/users/:id', async (req: any, res) => {
  const { id } = req.params;
  const { isActive, role, cloudEditorAllowed } = req.body;

  // Cannot modify yourself
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Cannot modify your own account from admin panel' });
  }

  try {
    const data: any = {};
    if (isActive !== undefined) data.isActive = isActive;
    if (role !== undefined) data.role = role;
    if (cloudEditorAllowed !== undefined) data.cloudEditorAllowed = cloudEditorAllowed;

    const user = await prisma.user.update({ where: { id }, data });
    res.json({ id: user.id, email: user.email, role: user.role, isActive: user.isActive, cloudEditorAllowed: user.cloudEditorAllowed });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/users/:id', async (req: any, res) => {
  const { id } = req.params;

  if (id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    // Delete user's projects and messages (cascade)
    await prisma.chatMessage.deleteMany({ where: { project: { userId: id } } });
    await prisma.gitHubWebhook.deleteMany({ where: { project: { userId: id } } });
    await prisma.project.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// --- Invite Codes ---

router.get('/invites', async (req, res) => {
  try {
    const invites = await prisma.inviteCode.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(invites);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list invites' });
  }
});

router.post('/invites', async (req: any, res) => {
  try {
    const code = crypto.randomBytes(4).toString('hex'); // 8-char hex
    const invite = await prisma.inviteCode.create({
      data: {
        code,
        createdBy: req.user.id,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      },
    });
    res.json(invite);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate invite' });
  }
});

router.delete('/invites/:id', async (req, res) => {
  try {
    await prisma.inviteCode.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete invite' });
  }
});

// --- Server Config ---

router.get('/config', (req, res) => {
  const config = serverConfigService.getAll();
  // Mask SMTP password
  if (config['smtp.pass']) {
    config['smtp.pass'] = '••••••••';
  }
  res.json(config);
});

router.patch('/config', async (req, res) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      // Don't update masked password
      if (key === 'smtp.pass' && value === '••••••••') continue;
      await serverConfigService.set(key, value);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// --- Teams ---

router.get('/teams', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      include: {
        _count: { select: { members: true, projects: true, kits: true } },
        members: {
          where: { role: 'owner' },
          include: { user: { select: { email: true, name: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(teams.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      createdAt: t.createdAt,
      memberCount: t._count.members,
      projectCount: t._count.projects,
      kitCount: t._count.kits,
      owner: t.members[0]?.user ?? null,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

router.get('/teams/:id', async (req, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        invites: { orderBy: { createdAt: 'desc' } },
        _count: { select: { projects: true, kits: true } },
      },
    });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json({
      ...team,
      projectCount: team._count.projects,
      kitCount: team._count.kits,
      _count: undefined,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get team' });
  }
});

router.delete('/teams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Unassign projects from team
    await prisma.project.updateMany({ where: { teamId: id }, data: { teamId: null } });
    // Unassign kits from team
    await prisma.kit.updateMany({ where: { teamId: id }, data: { teamId: null } });
    // Delete team (cascades members + invites)
    await prisma.team.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// --- Containers ---

router.get('/containers', async (req, res) => {
  try {
    const statuses = await containerRegistry.getDetailedStatuses();
    const userIds = statuses.map(s => s.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    res.json(statuses.map(s => ({
      ...s,
      user: userMap[s.userId] || { email: 'unknown' },
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list containers' });
  }
});

router.post('/containers/:userId/pause', async (req, res) => {
  try {
    const manager = containerRegistry.getManagerIfExists(req.params.userId);
    if (!manager) return res.status(404).json({ error: 'No container for this user' });
    await manager.pause();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pause container' });
  }
});

router.post('/containers/:userId/unpause', async (req, res) => {
  try {
    const manager = containerRegistry.getManagerIfExists(req.params.userId);
    if (!manager) return res.status(404).json({ error: 'No container for this user' });
    await manager.unpause();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unpause container' });
  }
});

router.post('/containers/:userId/stop', async (req, res) => {
  try {
    const manager = containerRegistry.getManagerIfExists(req.params.userId);
    if (!manager) return res.status(404).json({ error: 'No container for this user' });
    await containerRegistry.removeManager(req.params.userId);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop container' });
  }
});

router.post('/containers/:userId/restart', async (req, res) => {
  try {
    const manager = containerRegistry.getManagerIfExists(req.params.userId);
    if (!manager) return res.status(404).json({ error: 'No container for this user' });
    await containerRegistry.removeManager(req.params.userId);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restart container' });
  }
});

// --- Stats ---

router.get('/stats', async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    const projectCount = await prisma.project.count();
    const teamCount = await prisma.team.count();
    const containerStatuses = containerRegistry.getContainerStatuses();
    const activeContainers = containerStatuses.filter(c => c.running).length;

    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptime = os.uptime();

    // CPU usage average (1-min load avg on unix)
    const loadAvg = os.loadavg();

    res.json({
      users: userCount,
      projects: projectCount,
      teams: teamCount,
      containers: {
        active: activeContainers,
        total: containerStatuses.length,
        max: parseInt(serverConfigService.get('containers.maxActive') || '5', 10),
        statuses: containerStatuses,
      },
      system: {
        cpuCount: cpus.length,
        loadAvg: loadAvg[0],
        totalMemMB: Math.round(totalMem / 1024 / 1024),
        freeMemMB: Math.round(freeMem / 1024 / 1024),
        usedMemPercent: Math.round((1 - freeMem / totalMem) * 100),
        uptimeSeconds: Math.round(uptime),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// --- GDPR Data Export ---

// In-memory store for download tokens (token → { filePath, expiresAt })
const exportTokens = new Map<string, { filePath: string; expiresAt: number }>();

// Cleanup expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of exportTokens) {
    if (now > data.expiresAt) {
      fs.rm(data.filePath, { force: true }).catch(() => {});
      exportTokens.delete(token);
    }
  }
}, 10 * 60 * 1000);

router.post('/users/:id/export', async (req: any, res) => {
  const { id } = req.params;
  const sendEmail = req.body.sendEmail !== false;

  try {
    // Fetch user with all related data
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        projects: {
          include: {
            messages: { orderBy: { timestamp: 'asc' } },
          },
        },
        teams: {
          include: { team: { select: { id: true, name: true, slug: true } } },
        },
        kits: true,
        kitLessons: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build export directory
    const exportDir = path.join(STORAGE_DIR, 'exports');
    await fs.mkdir(exportDir, { recursive: true });
    const timestamp = new Date().toISOString().slice(0, 10);
    const zipFilename = `user-data-${user.email.replace(/[^a-zA-Z0-9]/g, '_')}-${timestamp}.zip`;
    const zipPath = path.join(exportDir, zipFilename);

    // Pre-check which projects have files on disk
    const projectPaths = new Map<string, string>();
    for (const project of user.projects) {
      const pp = projectFsService.getProjectPath(project.id);
      try {
        await fs.stat(pp);
        projectPaths.set(project.id, pp);
      } catch {
        // No files on disk
      }
    }

    // Create ZIP archive
    const output = require('fs').createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 5 } });

    await new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      // 1. User profile (strip sensitive fields)
      archive.append(JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        cloudEditorAllowed: user.cloudEditorAllowed,
        authProvider: user.authProvider,
        githubUsername: user.githubUsername,
        githubAvatarUrl: user.githubAvatarUrl,
        googleAvatarUrl: user.googleAvatarUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }, null, 2), { name: 'user.json' });

      // 2. Projects
      for (const project of user.projects) {
        const prefix = `projects/${project.id}/`;
        archive.append(JSON.stringify({
          id: project.id,
          name: project.name,
          selectedKitId: project.selectedKitId,
          isPublished: project.isPublished,
          publishSlug: project.publishSlug,
          publishVisibility: project.publishVisibility,
          publishedAt: project.publishedAt,
          githubRepoFullName: project.githubRepoFullName,
          githubBranch: project.githubBranch,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        }, null, 2), { name: prefix + 'project.json' });

        // Chat messages
        if (project.messages.length > 0) {
          const messages = project.messages.map(m => ({
            id: m.id,
            role: m.role,
            text: m.text,
            model: m.model,
            usage: m.usage ? JSON.parse(m.usage) : null,
            timestamp: m.timestamp,
          }));
          archive.append(JSON.stringify(messages, null, 2), { name: prefix + 'messages.json' });
        }

        // Project files from disk
        const diskPath = projectPaths.get(project.id);
        if (diskPath) {
          const excluded = new Set(['node_modules', '.git', '.angular', 'dist', '.cache', 'tmp', '.nx']);
          archive.directory(diskPath, prefix + 'files', (entry) => {
            if (entry.name.split('/').some(p => excluded.has(p))) return false;
            return entry;
          });
        }
      }

      // 3. Teams
      if (user.teams.length > 0) {
        archive.append(JSON.stringify(user.teams.map(tm => ({
          teamId: tm.team.id,
          teamName: tm.team.name,
          teamSlug: tm.team.slug,
          role: tm.role,
          joinedAt: tm.joinedAt,
        })), null, 2), { name: 'teams.json' });
      }

      // 4. Kits
      for (const kit of user.kits) {
        archive.append(JSON.stringify({
          id: kit.id,
          name: kit.name,
          description: kit.description,
          config: kit.config ? JSON.parse(kit.config) : null,
          createdAt: kit.createdAt,
          updatedAt: kit.updatedAt,
        }, null, 2), { name: `kits/${kit.id}/kit.json` });
      }

      // 5. Kit lessons
      if (user.kitLessons.length > 0) {
        archive.append(JSON.stringify(user.kitLessons.map(l => ({
          id: l.id,
          kitId: l.kitId,
          component: l.component,
          title: l.title,
          problem: l.problem,
          solution: l.solution,
          codeSnippet: l.codeSnippet,
          tags: l.tags,
          scope: l.scope,
          createdAt: l.createdAt,
        })), null, 2), { name: 'kit-lessons.json' });
      }

      // 6. Export manifest
      archive.append(JSON.stringify({
        exportDate: new Date().toISOString(),
        formatVersion: 1,
        userId: user.id,
        userEmail: user.email,
        projectCount: user.projects.length,
        messageCount: user.projects.reduce((sum, p) => sum + p.messages.length, 0),
        kitCount: user.kits.length,
        teamCount: user.teams.length,
      }, null, 2), { name: 'export-manifest.json' });

      archive.finalize();
    });

    // Generate a time-limited download token (valid 24h)
    const downloadToken = crypto.randomBytes(32).toString('hex');
    exportTokens.set(downloadToken, {
      filePath: zipPath,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const downloadUrl = `${baseUrl}/api/admin/exports/download/${downloadToken}`;

    // Send email if requested and SMTP is configured
    let emailSent = false;
    if (sendEmail && emailService.isConfigured()) {
      try {
        await emailService.sendDataExportEmail(user.email, downloadUrl);
        emailSent = true;
      } catch (err) {
        console.error('[Admin] Failed to send export email:', err);
      }
    }

    res.json({
      success: true,
      downloadUrl,
      emailSent,
      expiresIn: '24 hours',
    });
  } catch (error) {
    console.error('[Admin] Export failed:', error);
    res.status(500).json({ error: 'Failed to export user data' });
  }
});

// Public download router (no auth — uses time-limited token)
const publicRouter = express.Router();

publicRouter.get('/exports/download/:token', (req, res) => {
  const { token } = req.params;
  const data = exportTokens.get(token);

  if (!data || Date.now() > data.expiresAt) {
    exportTokens.delete(token);
    return res.status(410).json({ error: 'Download link has expired' });
  }

  res.download(data.filePath, path.basename(data.filePath), (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

export const adminRouter = router;
export const adminPublicRouter = publicRouter;
