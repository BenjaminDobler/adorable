import { Router } from 'express';
import { execFile } from 'child_process';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';
import { JWT_SECRET } from '../config';
import { prisma } from '../db/prisma';

const router = Router();

// Cache for claude code status (avoid re-spawning on every request)
let cachedStatus: { available: boolean; version?: string; desktopMode: boolean } | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 60_000; // 60 seconds

/**
 * GET /api/system/claude-code-status
 *
 * Checks whether the `claude` CLI is available on the local machine.
 * Only returns available: true in desktop mode.
 */
router.get('/claude-code-status', authenticate, async (_req, res) => {
  const now = Date.now();

  // Return cached result if fresh
  if (cachedStatus && now < cacheExpiry) {
    return res.json(cachedStatus);
  }

  const desktopMode = process.env['ADORABLE_DESKTOP_MODE'] === 'true';

  if (!desktopMode) {
    cachedStatus = { available: false, desktopMode: false };
    cacheExpiry = now + CACHE_TTL;
    return res.json(cachedStatus);
  }

  try {
    const version = await getClaudeVersion();
    cachedStatus = { available: true, version, desktopMode: true };
  } catch {
    cachedStatus = { available: false, desktopMode: true };
  }

  cacheExpiry = now + CACHE_TTL;
  res.json(cachedStatus);
});

/**
 * Spawn `claude --version` and parse the version string.
 * Rejects if the binary isn't found or times out.
 */
function getClaudeVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('claude', ['--version'], { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      // claude --version typically outputs something like "claude 1.2.3"
      const output = (stdout || stderr || '').trim();
      const match = output.match(/(\d+\.\d+\.\d+)/);
      resolve(match ? match[1] : output);
    });
  });
}

/**
 * GET /api/system/benchmark-token
 *
 * Returns a short-lived JWT for benchmark/eval scripts.
 * Desktop mode only — uses the first local user.
 */
router.get('/benchmark-token', async (_req, res) => {
  if (process.env['ADORABLE_DESKTOP_MODE'] !== 'true') {
    return res.status(403).json({ error: 'Only available in desktop mode' });
  }

  try {
    const user = await prisma.user.findFirst({ select: { id: true, email: true } });
    if (!user) return res.status(500).json({ error: 'No users found' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, userId: user.id, email: user.email });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as systemRouter };
