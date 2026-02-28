import { prisma } from '../db/prisma';

/**
 * Middleware for /:teamId routes.
 * Loads team + membership from the unique [teamId, userId] index.
 * Sets req.team and req.teamMember.
 * Returns 404 if team not found, 403 if not a member.
 */
export const loadTeamMember = async (req: any, res: any, next: any) => {
  const { teamId } = req.params;
  const userId = req.user?.id;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!member) return res.status(403).json({ error: 'Not a member of this team' });

  req.team = team;
  req.teamMember = member;
  next();
};

/**
 * Factory middleware. Checks req.teamMember.role against allowed roles.
 * Returns 403 if insufficient.
 */
export const requireTeamRole = (...roles: string[]) => {
  return (req: any, res: any, next: any) => {
    const member = req.teamMember;
    if (!member || !roles.includes(member.role)) {
      return res.status(403).json({ error: 'Insufficient team permissions' });
    }
    next();
  };
};
