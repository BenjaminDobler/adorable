import express, { Express, Router } from 'express';
import request from 'supertest';

/**
 * Create a test Express app with the given router
 */
export function createTestApp(router: Router, path = '/'): Express {
  const app = express();
  app.use(express.json());
  app.use(path, router);
  return app;
}

/**
 * Create a supertest request for the given app
 */
export function createRequest(app: Express) {
  return request(app);
}

/**
 * Helper to generate a valid JWT token for testing
 */
export function generateTestToken(userId: string, secret = 'test-jwt-secret'): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ userId }, secret, { expiresIn: '1h' });
}

/**
 * Helper to create HMAC signature for webhook testing
 */
export function createWebhookSignature(payload: string | Buffer, secret: string): string {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payload).digest('hex');
}
