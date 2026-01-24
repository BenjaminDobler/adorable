import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { githubService } from '../providers/github/github.service';
import { syncService } from '../providers/github/sync.service';
import { authenticate } from '../middleware/auth';
import { GitHubConnection, GitHubProjectSync } from '@adorable/shared-types';

const prisma = new PrismaClient();
const router = Router();

// OAuth state storage (in production, use Redis or database)
const oauthStates = new Map<string, { userId: string; timestamp: number }>();

// Clean up old states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes
      oauthStates.delete(state);
    }
  }
}, 60 * 1000);

/**
 * GET /api/github/auth
 * Initiates GitHub OAuth flow
 */
router.get('/auth', authenticate, (req: any, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { userId: req.user.id, timestamp: Date.now() });
  console.log('[GitHub Auth] Created state:', state, 'for user:', req.user.id);

  const authUrl = githubService.getAuthorizationUrl(state);
  console.log('[GitHub Auth] Auth URL:', authUrl);
  res.json({ url: authUrl });
});

/**
 * GET /api/github/callback
 * OAuth callback handler
 */
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  console.log('[GitHub Callback] code:', code, 'state:', state);
  console.log('[GitHub Callback] Known states:', [...oauthStates.keys()]);

  if (!code || !state) {
    console.log('[GitHub Callback] Missing params');
    return res.redirect('/?github_error=missing_params');
  }

  const stateData = oauthStates.get(state as string);
  if (!stateData) {
    console.log('[GitHub Callback] Invalid state - state not found in map');
    return res.redirect('/?github_error=invalid_state');
  }

  oauthStates.delete(state as string);

  try {
    // Exchange code for access token
    console.log('[GitHub Callback] Exchanging code for token...');
    const accessToken = await githubService.exchangeCodeForToken(code as string);
    console.log('[GitHub Callback] Got access token:', accessToken ? 'yes' : 'no');

    // Get GitHub user info
    const githubUser = await githubService.getUser(accessToken);
    console.log('[GitHub Callback] GitHub user:', githubUser.login);

    // Update user in database
    await prisma.user.update({
      where: { id: stateData.userId },
      data: {
        githubId: String(githubUser.id),
        githubUsername: githubUser.login,
        githubAccessToken: accessToken, // TODO: Encrypt this
        githubAvatarUrl: githubUser.avatar_url,
      },
    });

    // Redirect back to client app with success
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:4200';
    res.redirect(`${clientUrl}/profile?github_connected=true`);
  } catch (error: any) {
    console.error('GitHub OAuth error:', error);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:4200';
    res.redirect(`${clientUrl}/?github_error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /api/github/connection
 * Get current GitHub connection status
 */
router.get('/connection', authenticate, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        githubId: true,
        githubUsername: true,
        githubAvatarUrl: true,
      },
    });

    const connection: GitHubConnection = {
      connected: !!user?.githubId,
      username: user?.githubUsername || undefined,
      avatarUrl: user?.githubAvatarUrl || undefined,
    };

    res.json(connection);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/github/disconnect
 * Disconnect GitHub account
 */
router.post('/disconnect', authenticate, async (req: any, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        githubId: null,
        githubUsername: null,
        githubAccessToken: null,
        githubAvatarUrl: null,
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/github/repos
 * List user's GitHub repositories
 */
router.get('/repos', authenticate, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      return res.status(401).json({ error: 'GitHub not connected' });
    }

    const repos = await githubService.listRepositories(user.githubAccessToken);
    res.json(repos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/github/repos
 * Create a new GitHub repository
 */
router.post('/repos', authenticate, async (req: any, res) => {
  try {
    const { name, isPrivate, description } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      return res.status(401).json({ error: 'GitHub not connected' });
    }

    const repo = await githubService.createRepository(
      user.githubAccessToken,
      name,
      isPrivate ?? true,
      description
    );

    res.json(repo);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/github/connect/:projectId
 * Connect a project to a GitHub repository
 */
router.post('/connect/:projectId', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;
    const { repoFullName } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      return res.status(401).json({ error: 'GitHub not connected' });
    }

    // Verify user owns the project
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user.id },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get repo info and default branch
    const repo = await githubService.getRepository(user.githubAccessToken, repoFullName);
    const latestCommit = await githubService.getLatestCommit(
      user.githubAccessToken,
      repoFullName,
      repo.default_branch
    );

    // Create webhook for sync
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const webhookUrl = `${process.env.APP_URL || 'http://localhost:3333'}/api/webhooks/github`;

    let webhookId: number | null = null;
    try {
      webhookId = await githubService.createWebhook(
        user.githubAccessToken,
        repoFullName,
        webhookUrl,
        webhookSecret
      );
    } catch (e: any) {
      console.warn('Failed to create webhook (may already exist):', e.message);
    }

    // Update project with GitHub connection
    await prisma.project.update({
      where: { id: projectId },
      data: {
        githubRepoId: String(repo.id),
        githubRepoFullName: repo.full_name,
        githubBranch: repo.default_branch,
        githubLastCommitSha: latestCommit,
        githubSyncEnabled: true,
      },
    });

    // Store webhook info if created
    if (webhookId) {
      await prisma.gitHubWebhook.upsert({
        where: { projectId },
        create: {
          projectId,
          webhookId: String(webhookId),
          secret: webhookSecret,
        },
        update: {
          webhookId: String(webhookId),
          secret: webhookSecret,
        },
      });
    }

    res.json({
      success: true,
      repoFullName: repo.full_name,
      branch: repo.default_branch,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/github/disconnect/:projectId
 * Disconnect a project from GitHub
 */
router.post('/disconnect/:projectId', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubAccessToken: true },
    });

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user.id },
      include: { githubWebhook: true },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete webhook if exists
    if (project.githubWebhook && user?.githubAccessToken && project.githubRepoFullName) {
      try {
        await githubService.deleteWebhook(
          user.githubAccessToken,
          project.githubRepoFullName,
          project.githubWebhook.webhookId
        );
      } catch (e) {
        console.warn('Failed to delete webhook:', e);
      }

      await prisma.gitHubWebhook.delete({
        where: { projectId },
      });
    }

    // Clear GitHub fields
    await prisma.project.update({
      where: { id: projectId },
      data: {
        githubRepoId: null,
        githubRepoFullName: null,
        githubBranch: null,
        githubLastSyncAt: null,
        githubLastCommitSha: null,
        githubSyncEnabled: false,
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/github/sync/:projectId
 * Get sync status for a project
 */
router.get('/sync/:projectId', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user.id },
      select: {
        githubSyncEnabled: true,
        githubRepoFullName: true,
        githubBranch: true,
        githubLastSyncAt: true,
        githubLastCommitSha: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const syncStatus: GitHubProjectSync = {
      enabled: project.githubSyncEnabled,
      repoFullName: project.githubRepoFullName || undefined,
      branch: project.githubBranch || undefined,
      lastSyncAt: project.githubLastSyncAt?.toISOString(),
      lastCommitSha: project.githubLastCommitSha || undefined,
    };

    res.json(syncStatus);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/github/sync/:projectId/push
 * Push project files to GitHub
 */
router.post('/sync/:projectId/push', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;
    const { message } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      return res.status(401).json({ error: 'GitHub not connected' });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user.id },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.githubRepoFullName || !project.githubBranch) {
      return res.status(400).json({ error: 'Project not connected to GitHub' });
    }

    // Parse project files
    const files = JSON.parse(project.files);

    // Push to GitHub
    const commitSha = await syncService.pushToGitHub(
      user.githubAccessToken,
      project.githubRepoFullName,
      project.githubBranch,
      files,
      message || `Update from Adorable - ${new Date().toISOString()}`
    );

    // Update project with new commit SHA
    await prisma.project.update({
      where: { id: projectId },
      data: {
        githubLastSyncAt: new Date(),
        githubLastCommitSha: commitSha,
      },
    });

    res.json({ success: true, commitSha });
  } catch (error: any) {
    console.error('Push error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/github/sync/:projectId/pull
 * Pull latest files from GitHub
 */
router.post('/sync/:projectId/pull', authenticate, async (req: any, res) => {
  try {
    const { projectId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      return res.status(401).json({ error: 'GitHub not connected' });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user.id },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.githubRepoFullName || !project.githubBranch) {
      return res.status(400).json({ error: 'Project not connected to GitHub' });
    }

    // Pull from GitHub
    const { files, commitSha } = await syncService.pullFromGitHub(
      user.githubAccessToken,
      project.githubRepoFullName,
      project.githubBranch
    );

    // Update project with new files
    await prisma.project.update({
      where: { id: projectId },
      data: {
        files: JSON.stringify(files),
        githubLastSyncAt: new Date(),
        githubLastCommitSha: commitSha,
      },
    });

    res.json({ success: true, commitSha, files });
  } catch (error: any) {
    console.error('Pull error:', error);
    res.status(500).json({ error: error.message });
  }
});

export const githubRouter = router;
