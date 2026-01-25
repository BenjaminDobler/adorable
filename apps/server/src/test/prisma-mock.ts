import { vi } from 'vitest';
import type { PrismaClient, User, Project, GitHubWebhook } from '@prisma/client';

// Create a mock Prisma client for testing
export function createPrismaMock() {
  return {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    gitHubWebhook: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  } as unknown as PrismaClient;
}

// Default mock user for testing
export const mockUser: User = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  password: '$2a$10$hashedpassword', // bcrypt hash placeholder
  settings: null,
  githubId: null,
  githubUsername: null,
  githubAccessToken: null,
  githubAvatarUrl: null,
};

// Helper to create a mock user with custom overrides
export function createMockUser(overrides: Partial<User> = {}): User {
  return { ...mockUser, ...overrides };
}

// Helper to create a mock project
export function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'test-project-id',
    name: 'Test Project',
    userId: 'test-user-id',
    files: '{}',
    thumbnail: null,
    figmaImports: null,
    githubRepoId: null,
    githubRepoFullName: null,
    githubBranch: null,
    githubLastCommitSha: null,
    githubSyncEnabled: false,
    githubLastSyncAt: null,
    githubPagesUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Helper to mock GitHub webhook
export function createMockWebhook(overrides: Partial<GitHubWebhook> = {}): GitHubWebhook {
  return {
    id: 'test-webhook-id',
    projectId: 'test-project-id',
    webhookId: 12345,
    secret: 'webhook-secret-123',
    ...overrides,
  };
}
