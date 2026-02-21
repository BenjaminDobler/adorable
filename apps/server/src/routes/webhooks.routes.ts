import { Router, raw } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { syncService } from '../providers/github/sync.service';
import { projectFsService } from '../services/project-fs.service';

const prisma = new PrismaClient();
const router = Router();

// Use raw body for webhook signature verification
router.use('/github', raw({ type: 'application/json' }));

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(payload: Buffer, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

/**
 * POST /api/webhooks/github
 * Handle GitHub webhook events
 */
router.post('/github', async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const event = req.headers['x-github-event'] as string;
    const deliveryId = req.headers['x-github-delivery'] as string;

    if (!signature || !event) {
      return res.status(400).json({ error: 'Missing required headers' });
    }

    const payload = req.body;
    const body = JSON.parse(payload.toString());

    // Handle ping event (sent when webhook is created)
    if (event === 'ping') {
      console.log(`[Webhook] Ping received for hook ${body.hook_id}`);
      return res.json({ message: 'pong' });
    }

    // We only handle push events
    if (event !== 'push') {
      return res.json({ message: `Event ${event} ignored` });
    }

    // Get repository info from the payload
    const repoId = String(body.repository?.id);
    const repoFullName = body.repository?.full_name;
    const branch = body.ref?.replace('refs/heads/', '');
    const commitSha = body.after;

    if (!repoId || !repoFullName || !branch || !commitSha) {
      return res.status(400).json({ error: 'Invalid push payload' });
    }

    console.log(`[Webhook] Push to ${repoFullName}/${branch} - commit ${commitSha}`);

    // Find project connected to this repository
    const project = await prisma.project.findFirst({
      where: {
        githubRepoId: repoId,
        githubBranch: branch,
        githubSyncEnabled: true,
      },
      include: {
        githubWebhook: true,
        user: {
          select: { githubAccessToken: true },
        },
      },
    });

    if (!project) {
      console.log(`[Webhook] No project found for repo ${repoFullName}/${branch}`);
      return res.json({ message: 'No matching project' });
    }

    // Verify webhook signature
    if (project.githubWebhook) {
      const isValid = verifyGitHubSignature(
        payload,
        signature,
        project.githubWebhook.secret
      );

      if (!isValid) {
        console.error(`[Webhook] Invalid signature for project ${project.id}`);
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Skip if this is our own commit (to prevent infinite loops)
    const pusherEmail = body.pusher?.email;
    if (pusherEmail === 'adorable@noreply.adorable.dev') {
      console.log(`[Webhook] Skipping own commit`);
      return res.json({ message: 'Own commit ignored' });
    }

    // Skip if commit SHA matches what we already have
    if (project.githubLastCommitSha === commitSha) {
      console.log(`[Webhook] Commit ${commitSha} already synced`);
      return res.json({ message: 'Already synced' });
    }

    // Pull the new files if we have access token
    if (project.user.githubAccessToken) {
      try {
        console.log(`[Webhook] Pulling changes for project ${project.id}`);

        const { files, commitSha: newSha } = await syncService.pullFromGitHub(
          project.user.githubAccessToken,
          repoFullName,
          branch
        );

        // Write pulled files to disk
        await projectFsService.writeProjectFiles(project.id, files);

        // Update project metadata (no files blob in DB)
        await prisma.project.update({
          where: { id: project.id },
          data: {
            githubLastSyncAt: new Date(),
            githubLastCommitSha: newSha,
          },
        });

        console.log(`[Webhook] Project ${project.id} updated to commit ${newSha}`);

        // TODO: Notify connected clients via WebSocket
        // This would allow real-time updates when someone pushes to GitHub

      } catch (pullError: any) {
        console.error(`[Webhook] Failed to pull changes:`, pullError);
        // Don't fail the webhook, just log the error
      }
    }

    res.json({ success: true, commitSha });
  } catch (error: any) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export const webhooksRouter = router;
