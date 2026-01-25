import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

// Use vi.hoisted to create mocks that are available during vi.mock hoisting
const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  pullFromGitHub: vi.fn(),
}));

// Mock dependencies before importing the router
vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      project = {
        findFirst: mocks.findFirst,
        update: mocks.update,
      };
    },
  };
});

vi.mock('../providers/github/sync.service', () => ({
  syncService: {
    pullFromGitHub: mocks.pullFromGitHub,
  },
}));

import { webhooksRouter } from './webhooks.routes';

describe('Webhooks Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use('/webhooks', webhooksRouter);
  });

  function createSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    return 'sha256=' + hmac.update(payload).digest('hex');
  }

  describe('POST /webhooks/github', () => {
    const validPushPayload = {
      repository: { id: 12345, full_name: 'user/repo' },
      ref: 'refs/heads/main',
      after: 'abc123commitsha',
      pusher: { email: 'developer@example.com' },
    };

    it('should reject request with missing signature header', async () => {
      const response = await request(app)
        .post('/webhooks/github')
        .set('x-github-event', 'push')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(validPushPayload));

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required headers');
    });

    it('should reject request with missing event header', async () => {
      const payload = JSON.stringify(validPushPayload);
      const signature = createSignature(payload, 'webhook-secret');

      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required headers');
    });

    it('should handle ping event correctly', async () => {
      const pingPayload = JSON.stringify({ hook_id: 12345 });
      const signature = createSignature(pingPayload, 'any-secret');

      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'ping')
        .set('Content-Type', 'application/json')
        .send(pingPayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('pong');
    });

    it('should ignore non-push events', async () => {
      const issuePayload = JSON.stringify({ action: 'opened' });
      const signature = createSignature(issuePayload, 'any-secret');

      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'issues')
        .set('Content-Type', 'application/json')
        .send(issuePayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Event issues ignored');
    });

    it('should reject invalid HMAC signature', async () => {
      const payload = JSON.stringify(validPushPayload);
      // Create a valid-length but wrong signature (64 hex chars = 32 bytes for sha256)
      const invalidSignature = 'sha256=' + 'a'.repeat(64);

      // Mock finding a project with webhook
      mocks.findFirst.mockResolvedValue({
        id: 'project-123',
        name: 'Test Project',
        userId: 'user-123',
        files: '{}',
        thumbnail: null,
        figmaImports: null,
        githubRepoId: '12345',
        githubRepoFullName: 'user/repo',
        githubBranch: 'main',
        githubLastCommitSha: 'oldsha',
        githubSyncEnabled: true,
        githubLastSyncAt: null,
        githubPagesUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        githubWebhook: { secret: 'webhook-secret' },
        user: { githubAccessToken: 'token123' },
      } as any);

      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', invalidSignature)
        .set('x-github-event', 'push')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid signature');
    });

    it('should accept valid HMAC signature and process push', async () => {
      const webhookSecret = 'webhook-secret-123';
      const payload = JSON.stringify(validPushPayload);
      const signature = createSignature(payload, webhookSecret);

      // Mock finding a project with webhook
      mocks.findFirst.mockResolvedValue({
        id: 'project-123',
        name: 'Test Project',
        userId: 'user-123',
        files: '{}',
        thumbnail: null,
        figmaImports: null,
        githubRepoId: '12345',
        githubRepoFullName: 'user/repo',
        githubBranch: 'main',
        githubLastCommitSha: 'oldsha',
        githubSyncEnabled: true,
        githubLastSyncAt: null,
        githubPagesUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        githubWebhook: { secret: webhookSecret },
        user: { githubAccessToken: 'token123' },
      } as any);

      // Mock successful pull
      mocks.pullFromGitHub.mockResolvedValue({
        files: { directory: {} },
        commitSha: 'abc123commitsha',
      });

      mocks.update.mockResolvedValue({} as any);

      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'push')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mocks.pullFromGitHub).toHaveBeenCalledWith('token123', 'user/repo', 'main');
    });

    it('should ignore duplicate commits (same SHA)', async () => {
      const payload = JSON.stringify(validPushPayload);
      const signature = createSignature(payload, 'webhook-secret');

      // Mock project that already has this commit SHA
      mocks.findFirst.mockResolvedValue({
        id: 'project-123',
        githubLastCommitSha: 'abc123commitsha', // Same as payload.after
        githubWebhook: { secret: 'webhook-secret' },
        user: { githubAccessToken: 'token123' },
      } as any);

      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'push')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Already synced');
      expect(mocks.pullFromGitHub).not.toHaveBeenCalled();
    });

    it('should return no matching project when none found', async () => {
      const payload = JSON.stringify(validPushPayload);
      const signature = createSignature(payload, 'any-secret');

      mocks.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'push')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('No matching project');
    });
  });
});
