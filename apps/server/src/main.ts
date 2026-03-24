import express from 'express';
import * as path from 'path';
import cors from 'cors';
import 'dotenv/config';
import * as fs from 'fs/promises';
import cookieParser from 'cookie-parser';

import { JWT_SECRET, PORT, SITES_DIR } from './config';
import { containerProxy, getUserId } from './middleware/proxy';
import { containerRegistry } from './providers/container/container-registry';
import { logger } from './logger';
import { prisma } from './db/prisma';
import { authRouter } from './routes/auth.routes';
import { projectRouter } from './routes/project.routes';
import { aiRouter } from './routes/ai.routes';
import { contextPreviewRouter } from './routes/context-preview.routes';
import { containerRouter } from './routes/container.routes';
import { profileRouter } from './routes/profile.routes';
import { skillsRouter } from './routes/skills.routes';
import { figmaRouter } from './routes/figma.routes';
import { githubRouter } from './routes/github.routes';
import { webhooksRouter } from './routes/webhooks.routes';
import { mcpRouter } from './routes/mcp.routes';
import { kitRouter } from './routes/kit.routes';
import { analyticsRouter } from './routes/analytics.routes';
import { kitFsService } from './services/kit-fs.service';
import { kitService } from './services/kit.service';
import { serverConfigService } from './services/server-config.service';
import { adminRouter, adminPublicRouter } from './routes/admin.routes';
import { sessionAnalyzerRouter } from './routes/session-analyzer.routes';
import { teamRouter } from './routes/team.routes';
import { sitesAuthRouter } from './routes/sites-auth.routes';
import { sitesAccessControl } from './middleware/sites-auth';
import { socialAuthRouter } from './routes/social-auth.routes';
// Native routes are handled by the desktop local agent, not the cloud server
// import { nativeRouter } from './routes/native.routes';

const app = express();

// Trust Nginx reverse proxy (needed for rate limiting to read client IPs correctly)
app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));
app.use(cookieParser(JWT_SECRET));
app.use(express.json({ limit: '200mb' }));

// Apply Global Fallback Proxy
app.use(async (req: any, res, next) => {
  // Skip proxy for API routes (except /api/proxy), static sites, assets, and client routes
  if (req.path.startsWith('/api/auth') ||
      (req.path.startsWith('/api') && !req.path.startsWith('/api/proxy')) ||
      req.path.startsWith('/sites') ||
      req.path.startsWith('/api/sites') ||
      req.path.startsWith('/assets') ||
      // Skip browser noise that shouldn't go to container
      req.path.startsWith('/.well-known') ||
      req.path === '/favicon.ico' ||
      // Skip client-side routes (Angular SPA routes)
      req.path === '/profile' ||
      req.path === '/dashboard' ||
      req.path === '/analytics' ||
      req.path.startsWith('/chat/') ||
      req.path === '/login' ||
      req.path === '/register' ||
      req.path === '/forgot-password' ||
      req.path === '/reset-password' ||
      req.path === '/') {
    return next();
  }

  const userId = getUserId(req);
  if (userId) {
    // Only proxy when the user actually has a running container.
    // Without this check, http-proxy-middleware falls back to the placeholder
    // target (localhost:3333) — the server's own port — creating a self-proxy
    // loop that triggers EAGAIN / EADDRNOTAVAIL errors.
    try {
      const manager = containerRegistry.getManager(userId);
      if (!manager || !manager.isRunning()) {
        return next();
      }
    } catch {
      return next();
    }

    const queryUser = new URL(req.url, `http://${req.headers.host}`).searchParams.get('user');
    const cookieUser = req.signedCookies?.['adorable_container_user'];

    if (queryUser && queryUser !== cookieUser) {
       res.cookie('adorable_container_user', queryUser, {
          signed: true,
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000
       });
    }
    return (containerProxy as any)(req, res, next);
  }
  next();
});

// Ensure sites directory exists
fs.mkdir(SITES_DIR, { recursive: true }).catch(err =>
  logger.error('Failed to create sites directory', { error: err.message })
);

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Sites auth routes must be before the static middleware
app.use('/api/sites/auth', sitesAuthRouter);
app.use('/sites', sitesAccessControl, express.static(SITES_DIR));


// Logging middleware
app.use((req, res, next) => {
  if (!req.url.startsWith('/api/proxy')) {
    logger.info('request', { method: req.method, url: req.url });
  }
  next();
});

// Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/auth/social', socialAuthRouter);
app.use('/api/projects', projectRouter);
app.use('/api/github', githubRouter);  // Must be before aiRouter (which has global auth)
app.use('/api/webhooks', webhooksRouter);  // Webhooks also don't need auth
app.use('/api/context-preview', contextPreviewRouter);
app.use('/api', aiRouter);
app.use('/api/container', containerRouter);
app.use('/api/profile', profileRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/figma', figmaRouter);
app.use('/api/mcp', mcpRouter);
app.use('/api/kits', kitRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/admin', adminPublicRouter); // Public export download (no auth, token-based)
app.use('/api/admin', adminRouter);
app.use('/api/sessions', sessionAnalyzerRouter);
app.use('/api/teams', teamRouter);
// app.use('/api/native', nativeRouter); // Handled by desktop local agent

// Production SPA fallback: serve client index.html for non-API, non-proxy routes.
// In production, Nginx forwards unknown paths here (via @backend fallback)
// so Express can either proxy to a container or serve the Angular SPA shell.
const clientDistDir = path.join(__dirname, '../client/browser');
app.use(express.static(clientDistDir));
app.get('*', (req, res, next) => {
  // Don't serve index.html for API or asset paths
  if (req.path.startsWith('/api/') || req.path.startsWith('/sites/') || req.path.startsWith('/assets/')) {
    return next();
  }
  res.sendFile(path.join(clientDistDir, 'index.html'), (err) => {
    if (err) next(); // File not found in dev mode — just skip
  });
});

// Global Express error handler — must be last middleware (4-arg signature)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled route error', { error: err.message, stack: err.stack });
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const server = app.listen(PORT, async () => {
  logger.info(`Server listening`, { url: `http://localhost:${PORT}/api` });

  // Initialize server config (loads defaults, promotes first admin)
  await serverConfigService.initialize().catch(err =>
    logger.error('ServerConfig failed to initialize', { error: err.message })
  );

  // Migrate existing kits to disk storage (reads from user.settings, must run first)
  kitFsService.migrateAllKits().then(() =>
    // Move kits from user.settings JSON → Kit table, then clean up settings
    kitService.migrateFromSettings().catch(err =>
      logger.error('Kit DB migration failed', { error: err.message })
    )
  ).catch(err =>
    logger.error('Kit FS migration failed', { error: err.message })
  );

  // Signal to Electron that server is ready (for desktop mode)
  if (process.send) {
    process.send({ type: 'ready', port: PORT });
  }
});

// WebSocket Upgrade Handler for HMR support in multi-user environment
server.on('upgrade', (req, socket, head) => {
  const userId = getUserId(req);
  if (userId) {
     (containerProxy as any).upgrade(req, socket, head);
  }
});

server.on('error', (err) => {
  logger.error('Server error', { error: err.message });
});

// --- Process-level error handlers ---
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — exiting', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error('Unhandled rejection', { error: message, stack });
});

// --- Graceful shutdown ---
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutdown started', { signal });

  // Force-exit after 15s if cleanup hangs
  const forceTimer = setTimeout(() => {
    logger.error('Shutdown timed out after 15s — forcing exit');
    process.exit(1);
  }, 15_000);
  forceTimer.unref();

  try {
    // Stop accepting new connections
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    logger.info('HTTP server closed');

    // Stop all Docker containers
    await containerRegistry.shutdownAll();
    logger.info('All containers stopped');

    // Disconnect Prisma
    await prisma.$disconnect();
    logger.info('Prisma disconnected');

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error during shutdown', { error: message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
