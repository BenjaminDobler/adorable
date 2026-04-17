import { Router } from 'express';
import { execFile } from 'child_process';
import { authenticate } from '../middleware/auth';

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

export { router as systemRouter };
