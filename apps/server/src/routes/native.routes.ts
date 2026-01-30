import express from 'express';
import { nativeRegistry } from '../providers/container/native-registry';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

router.post('/start', async (req: any, res) => {
  try {
    const manager = nativeRegistry.getManager(req.user.id);
    const projectPath = await manager.createProject(req.user.id);
    res.json({ projectPath });
  } catch (e) {
    console.error('Failed to start native project', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/info', async (req: any, res) => {
  try {
    const manager = nativeRegistry.getManager(req.user.id);
    if (!manager.isRunning()) {
      return res.status(404).json({ error: 'No native project running' });
    }
    const info = await manager.getProjectInfo();
    if (!info) {
      return res.status(404).json({ error: 'Project info unavailable' });
    }
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/stop', async (req: any, res) => {
  try {
    await nativeRegistry.removeManager(req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/watch', async (req: any, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const manager = nativeRegistry.getManager(req.user.id);
    if (!manager.isRunning()) {
      res.write(`data: ${JSON.stringify({ error: 'No native project running' })}\n\n`);
      res.end();
      return;
    }

    manager.startWatcher();

    const onChanged = (data: { path: string; content: string }) => {
      res.write(`data: ${JSON.stringify({ type: 'changed', path: data.path, content: data.content })}\n\n`);
    };
    const onDeleted = (data: { path: string }) => {
      res.write(`data: ${JSON.stringify({ type: 'deleted', path: data.path })}\n\n`);
    };

    manager.events.on('file-changed', onChanged);
    manager.events.on('file-deleted', onDeleted);

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      manager.events.off('file-changed', onChanged);
      manager.events.off('file-deleted', onDeleted);
    });
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

router.post('/mount', async (req: any, res) => {
  const { files } = req.body;
  try {
    const manager = nativeRegistry.getManager(req.user.id);
    await manager.copyFiles(files);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/exec', async (req: any, res) => {
  const { cmd, args, workDir, env } = req.body;
  try {
    const manager = nativeRegistry.getManager(req.user.id);
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
    const manager = nativeRegistry.getManager(req.user.id);
    const fullCmd = [cmd, ...args];
    await manager.execStream(fullCmd, undefined, (chunk) => {
      res.write(`data: ${JSON.stringify({ output: chunk })}\n\n`);
    }, env);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

export const nativeRouter = router;
