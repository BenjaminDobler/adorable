import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { JWT_SECRET } from '../config';

/**
 * Middleware that runs before express.static() on /sites.
 * Enforces publish visibility: public/unlisted serve immediately,
 * private requires a signed cookie with a valid user JWT.
 */
export async function sitesAccessControl(req: Request, res: Response, next: NextFunction) {
  // Extract slug from the URL: /sites/{slug}/...
  const segments = req.path.split('/').filter(Boolean);
  const slug = segments[0];

  if (!slug) {
    return res.status(404).send('Not found');
  }

  try {
    const project = await prisma.project.findFirst({
      where: { publishSlug: slug, isPublished: true },
      select: {
        id: true,
        publishVisibility: true,
        userId: true,
        teamId: true,
      },
    });

    if (!project) {
      return res.status(404).send('Site not found');
    }

    // Public and unlisted: serve immediately
    if (project.publishVisibility !== 'private') {
      return next();
    }

    // Private: check for adorable_site_token signed cookie
    const siteToken = (req as any).signedCookies?.['adorable_site_token'];

    if (!siteToken) {
      const redirectUrl = encodeURIComponent(req.originalUrl);
      return res.redirect(`/api/sites/auth/login?redirect=${redirectUrl}`);
    }

    try {
      const decoded = jwt.verify(siteToken, JWT_SECRET) as { userId: string };
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, role: true },
      });

      if (!user) {
        const redirectUrl = encodeURIComponent(req.originalUrl);
        return res.redirect(`/api/sites/auth/login?redirect=${redirectUrl}`);
      }

      // Allow if admin
      if (user.role === 'admin') {
        return next();
      }

      // Allow if project owner
      if (project.userId === user.id) {
        return next();
      }

      // Allow if team member
      if (project.teamId) {
        const membership = await prisma.teamMember.findFirst({
          where: { teamId: project.teamId, userId: user.id },
        });
        if (membership) {
          return next();
        }
      }

      // User is authenticated but not authorized
      return res.status(403).send('You do not have access to this site');
    } catch {
      // Invalid token — redirect to login
      const redirectUrl = encodeURIComponent(req.originalUrl);
      return res.redirect(`/api/sites/auth/login?redirect=${redirectUrl}`);
    }
  } catch (err) {
    console.error('[SitesAuth] Error:', err);
    return res.status(500).send('Internal server error');
  }
}
