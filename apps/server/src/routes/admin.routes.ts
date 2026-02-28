import express from 'express';
import crypto from 'crypto';
import os from 'os';
import { prisma } from '../db/prisma';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { serverConfigService } from '../services/server-config.service';
import { containerRegistry } from '../providers/container/container-registry';

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
  const { isActive, role } = req.body;

  // Cannot modify yourself
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Cannot modify your own account from admin panel' });
  }

  try {
    const data: any = {};
    if (isActive !== undefined) data.isActive = isActive;
    if (role !== undefined) data.role = role;

    const user = await prisma.user.update({ where: { id }, data });
    res.json({ id: user.id, email: user.email, role: user.role, isActive: user.isActive });
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

export const adminRouter = router;
