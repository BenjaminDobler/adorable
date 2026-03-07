import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { JWT_SECRET } from '../config';
import { authRateLimit } from '../middleware/rate-limit';
import { serverConfigService } from '../services/server-config.service';
import { githubService } from '../providers/github/github.service';

const router = Router();

// OAuth state storage (in-memory, same pattern as github.routes.ts)
const oauthStates = new Map<string, { provider: string; timestamp: number; desktopRedirect?: string }>();

// Clean up old states periodically (10 min TTL)
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > 10 * 60 * 1000) {
      oauthStates.delete(state);
    }
  }
}, 60 * 1000);

// --- Helpers ---

// Social login reuses the same GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET as repo-linking.
// The GitHub OAuth app callback URL should be set to the origin (e.g. https://adorable.run)
// so both /api/github/callback and /api/auth/social/github/callback are allowed as redirect_uri.

function getGoogleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID || '';
}

function getGoogleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET || '';
}

function getGoogleCallbackUrl(requestOrigin: string): string {
  return process.env.GOOGLE_CALLBACK_URL || `${requestOrigin}/api/auth/social/google/callback`;
}

function buildGoogleAuthUrl(state: string, requestOrigin: string): string {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleCallbackUrl(requestOrigin),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeGoogleCode(code: string, requestOrigin: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: getGoogleCallbackUrl(requestOrigin),
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

async function getGoogleUser(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string;
  picture: string;
}> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Google API error: ${response.status}`);
  return response.json();
}

/**
 * Find or create a user from social login.
 * Auto-links if email matches an existing account.
 */
async function findOrCreateSocialUser(
  provider: 'github' | 'google',
  profile: { providerId: string; email: string; name: string; avatarUrl: string },
) {
  // 1. Try to find by provider ID
  const providerIdField = provider === 'github' ? 'githubId' : 'googleId';
  let user = await prisma.user.findFirst({
    where: { [providerIdField]: profile.providerId },
  });

  if (user) {
    return user;
  }

  // 2. Try to find by email (auto-link)
  user = await prisma.user.findUnique({ where: { email: profile.email } });

  if (user) {
    // Link the social provider to the existing account
    const updateData: Record<string, string> =
      provider === 'github'
        ? {
            githubId: profile.providerId,
            githubUsername: profile.name,
            githubAvatarUrl: profile.avatarUrl,
          }
        : {
            googleId: profile.providerId,
            googleAvatarUrl: profile.avatarUrl,
          };

    user = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });
    return user;
  }

  // 3. Create new user
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const hashedPassword = await bcrypt.hash(randomPassword, 10);

  const userCount = await prisma.user.count();
  const isFirstUser = userCount === 0;

  const cloudEditorAllowed = isFirstUser || serverConfigService.get('cloudEditor.defaultAccess') !== 'false';

  user = await prisma.user.create({
    data: {
      email: profile.email,
      password: hashedPassword,
      name: profile.name,
      role: isFirstUser ? 'admin' : 'user',
      emailVerified: true,
      authProvider: provider,
      cloudEditorAllowed,
      ...(provider === 'github'
        ? { githubId: profile.providerId, githubUsername: profile.name, githubAvatarUrl: profile.avatarUrl }
        : { googleId: profile.providerId, googleAvatarUrl: profile.avatarUrl }),
    },
  });
  return user;
}

function issueJwt(user: { id: string; role: string }): string {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

// --- Routes ---

/**
 * GET /api/auth/social/:provider/auth
 * Returns the OAuth authorization URL for the given provider.
 */
router.get('/:provider/auth', authRateLimit, (req, res) => {
  const { provider } = req.params;
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  const shouldRedirect = req.query.redirect === 'true';
  const desktopRedirect = req.query.desktop_redirect as string | undefined;

  // Validate desktop_redirect: must be http://127.0.0.1:<port>/...
  if (desktopRedirect && !/^http:\/\/127\.0\.0\.1:\d+\//.test(desktopRedirect)) {
    return res.status(400).json({ error: 'Invalid desktop_redirect URL' });
  }

  if (provider === 'github') {
    if (!process.env.GITHUB_CLIENT_ID) {
      return res.status(400).json({ error: 'GitHub login is not configured' });
    }
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { provider: 'github', timestamp: Date.now(), desktopRedirect });

    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: `${requestOrigin}/api/auth/social/github/callback`,
      scope: 'user:email',
      state,
    });
    const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
    return shouldRedirect ? res.redirect(url) : res.json({ url });
  }

  if (provider === 'google') {
    if (!getGoogleClientId()) {
      return res.status(400).json({ error: 'Google login is not configured' });
    }
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { provider: 'google', timestamp: Date.now(), desktopRedirect });

    const url = buildGoogleAuthUrl(state, requestOrigin);
    return shouldRedirect ? res.redirect(url) : res.json({ url });
  }

  res.status(400).json({ error: 'Unsupported provider' });
});

/**
 * GET /api/auth/social/:provider/callback
 * OAuth callback — exchanges code, finds/creates user, redirects with JWT.
 */
router.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, state } = req.query;
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  const clientUrl = process.env.CLIENT_URL || requestOrigin;

  if (!code || !state) {
    return res.redirect(`${clientUrl}/login?social_error=missing_params`);
  }

  const stateData = oauthStates.get(state as string);
  if (!stateData || stateData.provider !== provider) {
    return res.redirect(`${clientUrl}/login?social_error=invalid_state`);
  }
  oauthStates.delete(state as string);

  // Helper to redirect to desktop app or web client
  const redirectWithToken = (token: string) => {
    if (stateData.desktopRedirect) {
      return res.redirect(`${stateData.desktopRedirect}?token=${token}`);
    }
    return res.redirect(`${clientUrl}/login?social=success&token=${token}`);
  };
  const redirectWithError = (error: string) => {
    if (stateData.desktopRedirect) {
      return res.redirect(`${stateData.desktopRedirect}?error=${encodeURIComponent(error)}`);
    }
    return res.redirect(`${clientUrl}/login?social_error=${encodeURIComponent(error)}`);
  };

  try {
    let profile: { providerId: string; email: string; name: string; avatarUrl: string };
    let githubAccessToken: string | null = null;

    if (provider === 'github') {
      githubAccessToken = await githubService.exchangeCodeForToken(code as string);
      const githubUser = await githubService.getUser(githubAccessToken);
      const email = githubUser.email || await githubService.getUserPrimaryEmail(githubAccessToken);

      if (!email) {
        return redirectWithError('no_email');
      }

      profile = {
        providerId: String(githubUser.id),
        email,
        name: githubUser.name || githubUser.login,
        avatarUrl: githubUser.avatar_url,
      };
    } else if (provider === 'google') {
      const accessToken = await exchangeGoogleCode(code as string, requestOrigin);
      const googleUser = await getGoogleUser(accessToken);

      profile = {
        providerId: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
      };
    } else {
      return redirectWithError('unsupported_provider');
    }

    const user = await findOrCreateSocialUser(provider as 'github' | 'google', profile);

    if (!user.isActive) {
      return redirectWithError('account_disabled');
    }

    // Store GitHub access token so repo-linking works without a separate OAuth flow
    if (githubAccessToken) {
      await prisma.user.update({
        where: { id: user.id },
        data: { githubAccessToken, githubUsername: profile.name },
      });
    }

    const token = issueJwt(user);
    return redirectWithToken(token);
  } catch (error: any) {
    console.error(`[Social Auth] ${provider} callback error:`, error);
    return redirectWithError(error.message);
  }
});

export const socialAuthRouter = router;
