import express from 'express';
import * as path from 'path';
import cors from 'cors';
import 'dotenv/config';
import * as fs from 'fs/promises';
import cookieParser from 'cookie-parser';

import { JWT_SECRET, PORT, SITES_DIR } from './config';
import { containerProxy, getUserId } from './middleware/proxy';
import { authRouter } from './routes/auth.routes';
import { projectRouter } from './routes/project.routes';
import { aiRouter } from './routes/ai.routes';
import { containerRouter } from './routes/container.routes';
import { profileRouter } from './routes/profile.routes';
import { skillsRouter } from './routes/skills.routes';
import { figmaRouter } from './routes/figma.routes';

const app = express();

app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));
app.use(cookieParser(JWT_SECRET));
app.use(express.json({ limit: '50mb' }));

// Apply Global Fallback Proxy
app.use(async (req: any, res, next) => {
  if (req.path.startsWith('/api/auth') || (req.path.startsWith('/api') && !req.path.startsWith('/api/proxy'))) {
    return next();
  }

  const userId = getUserId(req);
  if (userId) {
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

// Critical headers for WebContainers (Applied to ALL responses)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// Ensure sites directory exists
fs.mkdir(SITES_DIR, { recursive: true }).catch(console.error);

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/sites', express.static(SITES_DIR));

// Logging middleware
app.use((req, res, next) => {
  if (!req.url.startsWith('/api/proxy')) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/projects', projectRouter);
app.use('/api', aiRouter);
app.use('/api/container', containerRouter);
app.use('/api/profile', profileRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/figma', figmaRouter);

const server = app.listen(PORT, () => {
  console.log(`Listening at http://localhost:${PORT}/api`);
});

// WebSocket Upgrade Handler for HMR support in multi-user environment
server.on('upgrade', (req, socket, head) => {
  const userId = getUserId(req);
  if (userId) {
     (containerProxy as any).upgrade(req, socket, head);
  }
});

server.on('error', console.error);
