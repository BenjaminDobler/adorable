import express from 'express';
import { containerRegistry } from '../providers/container/container-registry';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

router.post('/start', async (req: any, res) => {
  try {
    const manager = containerRegistry.getManager(req.user.id);
    
    // Sanitized naming: adorable-user-${safeName}-${userId}
    const safeName = req.user.name ? req.user.name.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase() : 'user';
    const containerName = `adorable-user-${safeName}-${req.user.id}`;
    
    const id = await manager.createContainer(undefined, containerName);
    containerRegistry.updateActivity(req.user.id);

    // Set signed cookie for the proxy to know which container to use
    res.cookie('adorable_container_user', req.user.id, {
       signed: true,
       httpOnly: true,
       sameSite: 'lax', // Needed for localhost cross-port
       maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ id });
  } catch (e) {
    console.error('Failed to start container', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/stop', async (req: any, res) => {
  try {
    await containerRegistry.removeManager(req.user.id);
    res.clearCookie('adorable_container_user');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/mount', async (req: any, res) => {
  const { files } = req.body;
  try {
    const manager = containerRegistry.getManager(req.user.id);
    await manager.copyFiles(files);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/exec', async (req: any, res) => {
  const { cmd, args, workDir, env } = req.body;
  try {
    const manager = containerRegistry.getManager(req.user.id);
    const fullCmd = [cmd, ...(args || [])];
    const result = await manager.exec(fullCmd, workDir, env);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/exec-stream', async (req: any, res) => {
  const cmd = req.query.cmd as string;
  const args = req.query.args ? (req.query.args as string).split(',') : [];
  const env = req.query.env ? JSON.parse(req.query.env as string) : undefined;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const manager = containerRegistry.getManager(req.user.id);
    const fullCmd = [cmd, ...args];
    await manager.execStream(fullCmd, '/app', (chunk) => {
       res.write(`data: ${JSON.stringify({ output: chunk })}\n\n`);
    }, env);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

export const containerRouter = router;
