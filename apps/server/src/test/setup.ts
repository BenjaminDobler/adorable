// Vitest test setup for server tests
import { vi } from 'vitest';

// Mock environment variables for tests
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing';
process.env.NODE_ENV = 'test';

// Make vi available globally (for jest-like syntax)
globalThis.vi = vi;
