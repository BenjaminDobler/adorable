import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock the prisma module before importing the router
vi.mock('../db/prisma', () => ({
  prisma: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// Mock config
vi.mock('../config', () => ({
  JWT_SECRET: 'test-jwt-secret',
}));

import { authRouter } from './auth.routes';
import { prisma } from '../db/prisma';

describe('Auth Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
  });

  describe('POST /auth/register', () => {
    it('should create user with hashed password and return token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed-password',
      };

      vi.mocked(prisma.user.create).mockResolvedValue({
        ...mockUser,
        settings: null,
        githubId: null,
        githubUsername: null,
        githubAccessToken: null,
        githubAvatarUrl: null,
      });

      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123', name: 'Test User' });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.id).toBe('user-123');

      // Verify password was hashed (not stored as plaintext)
      const createCall = vi.mocked(prisma.user.create).mock.calls[0][0];
      expect(createCall.data.password).not.toBe('password123');
    });

    it('should reject duplicate email with 400 status', async () => {
      const error = new Error('Unique constraint failed') as Error & { code: string };
      error.code = 'P2002';
      vi.mocked(prisma.user.create).mockRejectedValue(error);

      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'existing@example.com', password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('User already exists');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com' }); // Missing password

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email and password required');
    });

    it('should validate email is provided', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({ password: 'password123' }); // Missing email

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email and password required');
    });
  });

  describe('POST /auth/login', () => {
    it('should return valid JWT for correct credentials', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: hashedPassword,
        settings: null,
        githubId: null,
        githubUsername: null,
        githubAccessToken: null,
        githubAvatarUrl: null,
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.id).toBe('user-123');

      // Verify the token is valid
      const decoded = jwt.verify(response.body.token, 'test-jwt-secret') as { userId: string };
      expect(decoded.userId).toBe('user-123');
    });

    it('should reject invalid password with 401', async () => {
      const hashedPassword = await bcrypt.hash('correct-password', 10);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: hashedPassword,
        settings: null,
        githubId: null,
        githubUsername: null,
        githubAccessToken: null,
        githubAvatarUrl: null,
      });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'wrong-password' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject non-existent user with 401', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('POST /auth/logout', () => {
    it('should clear cookie and return success', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Check that the cookie clearing header is set
      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie[0]).toContain('adorable_container_user=');
    });
  });
});
