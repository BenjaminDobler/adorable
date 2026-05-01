import express from 'express';
import * as path from 'path';
import cors from 'cors';
import 'dotenv/config';
import * as fs from 'fs/promises';
import cookieParser from 'cookie-parser';

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, PORT, SITES_DIR } from './config';
import { validateConfigOrExit } from './config/validate';
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
import { figmaBridge } from './services/figma-bridge.service';
import { socialAuthRouter } from './routes/social-auth.routes';
import { systemRouter } from './routes/system.routes';
import { bridgeRouter } from './routes/bridge.routes';
import { mcpAdorableRouter } from './mcp/adorable-mcp-http';
// Native routes are handled by the desktop local agent, not the cloud server
// import { nativeRouter } from './routes/native.routes';

// Fail-fast on insecure / missing security-critical env vars in production;
// log warnings in dev and desktop. Runs before any HTTP listener is bound.
validateConfigOrExit();

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
      req.path.startsWith('/mcp') ||
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
app.use('/api/system', systemRouter);  // Before aiRouter (which has global auth)
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
// Adorable MCP server (always-on, Claude Code connects via URL)
app.use('/mcp', mcpAdorableRouter);
// Internal bridge API (desktop only — called by MCP server process)
if (process.env['ADORABLE_DESKTOP_MODE'] === 'true') {
  app.use('/api/internal/bridge', bridgeRouter);
}
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

  // Seed built-in kits from assets (creates or updates on every startup)
  kitService.seedDefaultKit().catch(err =>
    logger.error('Default kit seed failed', { error: err.message })
  );
  kitService.seedBuiltInKits().catch(err =>
    logger.error('Built-in kit seed failed', { error: err.message })
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

// WebSocket Upgrade Handler
const figmaWss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);

  // Figma Live Bridge WebSocket
  if (url.pathname === '/ws/figma-bridge') {
    const token = url.searchParams.get('token');
    const code = url.searchParams.get('code');

    if (token) {
      // Auth via JWT token (reconnect)
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        figmaWss.handleUpgrade(req, socket, head, (ws) => {
          figmaBridge.handleConnection(ws, decoded.userId);
        });
      } catch (err) {
        logger.error('Figma bridge: JWT verification failed', { error: (err as Error).message });
        socket.destroy();
      }
    } else if (code) {
      // Auth via connection code (first connect) — inline verify
      const { verifyBridgeCode } = await import('./routes/figma.routes');
      const result = verifyBridgeCode(code);
      if (result) {
        figmaWss.handleUpgrade(req, socket, head, (ws) => {
          figmaBridge.handleConnection(ws, result.userId);
          // Send back the JWT so plugin can reconnect later
          ws.send(JSON.stringify({ type: 'figma:auth', token: result.token }));
        });
      } else {
        logger.warn('Figma bridge: invalid connection code');
        socket.destroy();
      }
    } else {
      socket.destroy();
    }
    return;
  }

  // Skip non-proxy paths (e.g. /mcp) — only proxy container-bound paths
  if (!url.pathname.startsWith('/') || url.pathname.startsWith('/mcp') || url.pathname.startsWith('/api/')) {
    socket.destroy();
    return;
  }

  // HMR proxy for container preview
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
