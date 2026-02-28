import express from 'express';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth';
import { loadTeamMember, requireTeamRole } from '../middleware/team';
import { prisma } from '../db/prisma';

const router = express.Router();

router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a team name.
 * Lowercase, hyphen-separated, max 48 chars, deduped with -2, -3 suffix.
 */
async function generateSlug(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

  let slug = base;
  let suffix = 2;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${base.slice(0, 44)}-${suffix}`;
    suffix++;
  }
  return slug;
}

// ─── Team CRUD ────────────────────────────────────────────────────────────────

/**
 * Create a team. Creator becomes owner.
 * POST /api/teams
 */
router.post('/', async (req: any, res) => {
  const userId = req.user.id;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  try {
    const slug = await generateSlug(name.trim());

    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        slug,
        members: {
          create: { userId, role: 'owner' },
        },
      },
      include: { members: true },
    });

    res.json({ success: true, team });
  } catch (error) {
    console.error('[Team] Create error:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

/**
 * List user's teams with member/project/kit counts and the user's role.
 * GET /api/teams
 */
router.get('/', async (req: any, res) => {
  const userId = req.user.id;

  try {
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            _count: {
              select: { members: true, projects: true, kits: true },
            },
          },
        },
      },
    });

    const teams = memberships.map((m) => ({
      ...m.team,
      myRole: m.role,
    }));

    res.json({ teams });
  } catch (error) {
    console.error('[Team] List error:', error);
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

/**
 * Join a team via invite code.
 * POST /api/teams/join
 * Must be registered BEFORE /:teamId routes.
 */
router.post('/join', async (req: any, res) => {
  const userId = req.user.id;
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Invite code is required' });
  }

  try {
    const invite = await prisma.teamInvite.findUnique({ where: { code } });

    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }
    if (invite.usedBy) {
      return res.status(400).json({ error: 'Invite code has already been used' });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invite code has expired' });
    }
    if (invite.email && invite.email !== req.user.email) {
      return res.status(403).json({ error: 'This invite is for a different email address' });
    }

    // Check if already a member
    const existing = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: invite.teamId, userId } },
    });
    if (existing) {
      return res.status(400).json({ error: 'You are already a member of this team' });
    }

    // Create member + mark invite used atomically
    const [member] = await prisma.$transaction([
      prisma.teamMember.create({
        data: {
          teamId: invite.teamId,
          userId,
          role: invite.role || 'member',
        },
        include: { team: true },
      }),
      prisma.teamInvite.update({
        where: { id: invite.id },
        data: { usedBy: userId, usedAt: new Date() },
      }),
    ]);

    res.json({ success: true, team: member.team, role: member.role });
  } catch (error) {
    console.error('[Team] Join error:', error);
    res.status(500).json({ error: 'Failed to join team' });
  }
});

// ─── /:teamId routes (require membership) ────────────────────────────────────

/**
 * Get team details with members.
 * GET /api/teams/:teamId
 */
router.get('/:teamId', loadTeamMember, async (req: any, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.teamId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { projects: true, kits: true } },
      },
    });
    res.json({ team, myRole: req.teamMember.role });
  } catch (error) {
    console.error('[Team] Get error:', error);
    res.status(500).json({ error: 'Failed to get team' });
  }
});

/**
 * Update team name/slug.
 * PUT /api/teams/:teamId
 */
router.put(
  '/:teamId',
  loadTeamMember,
  requireTeamRole('owner', 'admin'),
  async (req: any, res) => {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    try {
      const slug = await generateSlug(name.trim());
      const team = await prisma.team.update({
        where: { id: req.params.teamId },
        data: { name: name.trim(), slug },
      });
      res.json({ success: true, team });
    } catch (error) {
      console.error('[Team] Update error:', error);
      res.status(500).json({ error: 'Failed to update team' });
    }
  }
);

/**
 * Delete team. Unassigns resources (projects/kits) before deleting.
 * CASCADE handles members + invites.
 * DELETE /api/teams/:teamId
 */
router.delete(
  '/:teamId',
  loadTeamMember,
  requireTeamRole('owner'),
  async (req: any, res) => {
    const teamId = req.params.teamId;

    try {
      await prisma.$transaction([
        // Unassign projects (don't delete them)
        prisma.project.updateMany({
          where: { teamId },
          data: { teamId: null },
        }),
        // Unassign kits (don't delete them — set userId to deleter so they aren't orphaned)
        prisma.kit.updateMany({
          where: { teamId },
          data: { teamId: null, userId: req.user.id },
        }),
        // Delete team (cascades members + invites)
        prisma.team.delete({ where: { id: teamId } }),
      ]);

      res.json({ success: true });
    } catch (error) {
      console.error('[Team] Delete error:', error);
      res.status(500).json({ error: 'Failed to delete team' });
    }
  }
);

// ─── Members ──────────────────────────────────────────────────────────────────

/**
 * List members.
 * GET /api/teams/:teamId/members
 */
router.get('/:teamId/members', loadTeamMember, async (req: any, res) => {
  try {
    const members = await prisma.teamMember.findMany({
      where: { teamId: req.params.teamId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    res.json({ members });
  } catch (error) {
    console.error('[Team] List members error:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

/**
 * Change a member's role (admin/member only, not owner).
 * PUT /api/teams/:teamId/members/:memberId/role
 */
router.put(
  '/:teamId/members/:memberId/role',
  loadTeamMember,
  requireTeamRole('owner'),
  async (req: any, res) => {
    const { role } = req.body;

    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "admin" or "member"' });
    }

    try {
      const target = await prisma.teamMember.findUnique({
        where: { id: req.params.memberId },
      });

      if (!target || target.teamId !== req.params.teamId) {
        return res.status(404).json({ error: 'Member not found' });
      }
      if (target.role === 'owner') {
        return res.status(400).json({ error: 'Cannot change the owner\'s role. Use transfer-ownership instead.' });
      }

      const updated = await prisma.teamMember.update({
        where: { id: req.params.memberId },
        data: { role },
      });
      res.json({ success: true, member: updated });
    } catch (error) {
      console.error('[Team] Change role error:', error);
      res.status(500).json({ error: 'Failed to change role' });
    }
  }
);

/**
 * Remove a member (owner/admin can remove others; any member can remove self / leave).
 * Owner must transfer ownership before leaving.
 * DELETE /api/teams/:teamId/members/:memberId
 */
router.delete(
  '/:teamId/members/:memberId',
  loadTeamMember,
  async (req: any, res) => {
    const teamId = req.params.teamId;
    const memberId = req.params.memberId;
    const actorRole = req.teamMember.role;

    try {
      const target = await prisma.teamMember.findUnique({
        where: { id: memberId },
      });

      if (!target || target.teamId !== teamId) {
        return res.status(404).json({ error: 'Member not found' });
      }

      const isSelf = target.userId === req.user.id;

      // Owner can't be removed (must transfer first)
      if (target.role === 'owner') {
        return res.status(400).json({ error: 'Owner cannot be removed. Transfer ownership first.' });
      }

      // Permission: owner/admin can remove anyone; members can only remove themselves
      if (!isSelf && !['owner', 'admin'].includes(actorRole)) {
        return res.status(403).json({ error: 'Insufficient team permissions' });
      }

      await prisma.teamMember.delete({ where: { id: memberId } });
      res.json({ success: true });
    } catch (error) {
      console.error('[Team] Remove member error:', error);
      res.status(500).json({ error: 'Failed to remove member' });
    }
  }
);

/**
 * Transfer ownership. Atomic swap: old owner -> admin, new owner -> owner.
 * POST /api/teams/:teamId/transfer-ownership
 */
router.post(
  '/:teamId/transfer-ownership',
  loadTeamMember,
  requireTeamRole('owner'),
  async (req: any, res) => {
    const { userId: newOwnerId } = req.body;
    const teamId = req.params.teamId;

    if (!newOwnerId || typeof newOwnerId !== 'string') {
      return res.status(400).json({ error: 'userId of the new owner is required' });
    }

    try {
      const newOwnerMember = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: newOwnerId } },
      });
      if (!newOwnerMember) {
        return res.status(404).json({ error: 'Target user is not a member of this team' });
      }
      if (newOwnerId === req.user.id) {
        return res.status(400).json({ error: 'You are already the owner' });
      }

      await prisma.$transaction([
        // Demote current owner to admin
        prisma.teamMember.update({
          where: { id: req.teamMember.id },
          data: { role: 'admin' },
        }),
        // Promote new owner
        prisma.teamMember.update({
          where: { id: newOwnerMember.id },
          data: { role: 'owner' },
        }),
      ]);

      res.json({ success: true });
    } catch (error) {
      console.error('[Team] Transfer ownership error:', error);
      res.status(500).json({ error: 'Failed to transfer ownership' });
    }
  }
);

// ─── Invites ──────────────────────────────────────────────────────────────────

/**
 * Create an invite code (8-char hex). Optional email, role, expiresAt.
 * POST /api/teams/:teamId/invites
 */
router.post(
  '/:teamId/invites',
  loadTeamMember,
  requireTeamRole('owner', 'admin'),
  async (req: any, res) => {
    const { email, role, expiresAt } = req.body;

    if (role && !['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invite role must be "admin" or "member"' });
    }

    try {
      const code = crypto.randomBytes(4).toString('hex');
      const invite = await prisma.teamInvite.create({
        data: {
          teamId: req.params.teamId,
          code,
          email: email || null,
          role: role || 'member',
          createdBy: req.user.id,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });
      res.json({ success: true, invite });
    } catch (error) {
      console.error('[Team] Create invite error:', error);
      res.status(500).json({ error: 'Failed to create invite' });
    }
  }
);

/**
 * List invites.
 * GET /api/teams/:teamId/invites
 */
router.get(
  '/:teamId/invites',
  loadTeamMember,
  requireTeamRole('owner', 'admin'),
  async (req: any, res) => {
    try {
      const invites = await prisma.teamInvite.findMany({
        where: { teamId: req.params.teamId },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ invites });
    } catch (error) {
      console.error('[Team] List invites error:', error);
      res.status(500).json({ error: 'Failed to list invites' });
    }
  }
);

/**
 * Revoke an invite.
 * DELETE /api/teams/:teamId/invites/:inviteId
 */
router.delete(
  '/:teamId/invites/:inviteId',
  loadTeamMember,
  requireTeamRole('owner', 'admin'),
  async (req: any, res) => {
    try {
      const invite = await prisma.teamInvite.findUnique({
        where: { id: req.params.inviteId },
      });

      if (!invite || invite.teamId !== req.params.teamId) {
        return res.status(404).json({ error: 'Invite not found' });
      }

      await prisma.teamInvite.delete({ where: { id: req.params.inviteId } });
      res.json({ success: true });
    } catch (error) {
      console.error('[Team] Delete invite error:', error);
      res.status(500).json({ error: 'Failed to delete invite' });
    }
  }
);

// ─── Move Resources ───────────────────────────────────────────────────────────

/**
 * Move a project into the team (sets teamId).
 * POST /api/teams/:teamId/projects/:projectId
 */
router.post(
  '/:teamId/projects/:projectId',
  loadTeamMember,
  requireTeamRole('owner', 'admin'),
  async (req: any, res) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.projectId },
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      // Only the project owner or a team admin can move it in
      if (project.userId !== req.user.id) {
        return res.status(403).json({ error: 'You can only move your own projects into a team' });
      }

      const updated = await prisma.project.update({
        where: { id: req.params.projectId },
        data: { teamId: req.params.teamId },
      });
      res.json({ success: true, project: updated });
    } catch (error) {
      console.error('[Team] Move project in error:', error);
      res.status(500).json({ error: 'Failed to move project into team' });
    }
  }
);

/**
 * Move a project back to personal (clears teamId).
 * DELETE /api/teams/:teamId/projects/:projectId
 */
router.delete(
  '/:teamId/projects/:projectId',
  loadTeamMember,
  requireTeamRole('owner', 'admin'),
  async (req: any, res) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.projectId },
      });

      if (!project || project.teamId !== req.params.teamId) {
        return res.status(404).json({ error: 'Project not found in this team' });
      }

      const updated = await prisma.project.update({
        where: { id: req.params.projectId },
        data: { teamId: null },
      });
      res.json({ success: true, project: updated });
    } catch (error) {
      console.error('[Team] Move project out error:', error);
      res.status(500).json({ error: 'Failed to move project out of team' });
    }
  }
);

/**
 * Move a kit into the team (sets teamId, clears userId).
 * POST /api/teams/:teamId/kits/:kitId
 */
router.post(
  '/:teamId/kits/:kitId',
  loadTeamMember,
  requireTeamRole('owner', 'admin'),
  async (req: any, res) => {
    try {
      const kit = await prisma.kit.findUnique({
        where: { id: req.params.kitId },
      });

      if (!kit) {
        return res.status(404).json({ error: 'Kit not found' });
      }
      if (kit.userId !== req.user.id) {
        return res.status(403).json({ error: 'You can only move your own kits into a team' });
      }

      const updated = await prisma.kit.update({
        where: { id: req.params.kitId },
        data: { teamId: req.params.teamId, userId: null },
      });
      res.json({ success: true, kit: updated });
    } catch (error) {
      console.error('[Team] Move kit in error:', error);
      res.status(500).json({ error: 'Failed to move kit into team' });
    }
  }
);

/**
 * Move a kit back to personal (sets userId, clears teamId).
 * DELETE /api/teams/:teamId/kits/:kitId
 */
router.delete(
  '/:teamId/kits/:kitId',
  loadTeamMember,
  requireTeamRole('owner', 'admin'),
  async (req: any, res) => {
    try {
      const kit = await prisma.kit.findUnique({
        where: { id: req.params.kitId },
      });

      if (!kit || kit.teamId !== req.params.teamId) {
        return res.status(404).json({ error: 'Kit not found in this team' });
      }

      const updated = await prisma.kit.update({
        where: { id: req.params.kitId },
        data: { userId: req.user.id, teamId: null },
      });
      res.json({ success: true, kit: updated });
    } catch (error) {
      console.error('[Team] Move kit out error:', error);
      res.status(500).json({ error: 'Failed to move kit out of team' });
    }
  }
);

export const teamRouter = router;
