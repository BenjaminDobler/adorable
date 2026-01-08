import express from 'express';
import * as path from 'path';
import cors from 'cors';
import { jsonrepair } from 'jsonrepair';
import 'dotenv/config';
import * as fs from 'fs/promises';
import { ProviderFactory } from './providers/factory';
import { prisma } from './db/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env['JWT_SECRET'] || 'fallback-secret';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const SITES_DIR = path.join(process.cwd(), 'published-sites');
fs.mkdir(SITES_DIR, { recursive: true }).catch(console.error);

// --- Authentication Routes ---

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name }
    });
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Registration error:', error);
    if ((error as any).code === 'P2002') {
      return res.status(400).json({ error: 'User already exists' });
    }
    res.status(500).json({ error: 'Registration failed', details: (error as any).message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- Auth Middleware ---

const authenticate = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Protected routes router
const protectedRouter = express.Router();
protectedRouter.use(authenticate);

// Critical headers for WebContainers (Applied to ALL responses)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/sites', express.static(SITES_DIR));

app.get('/api/health', (req, res) => {
  res.send({ status: 'ok' });
});

// --- User Profile Routes ---

protectedRouter.get('/profile', async (req: any, res) => {
  const { password, ...userWithoutPassword } = req.user;
  res.json(userWithoutPassword);
});

protectedRouter.post('/profile', async (req: any, res) => {
  const user = req.user;
  const { name, settings } = req.body;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name !== undefined ? name : undefined,
        settings: settings !== undefined ? JSON.stringify(settings) : undefined
      }
    });
    const { password, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// --- Project Persistence Routes ---

protectedRouter.get('/projects', async (req: any, res) => {
  const user = req.user;
  try {
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      select: { name: true, id: true, updatedAt: true, thumbnail: true },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

protectedRouter.post('/projects', async (req: any, res) => {
  const { name, files, id, thumbnail, messages } = req.body;
  const user = req.user;

  if (!name || !files) {
    return res.status(400).json({ error: 'Name and files are required' });
  }

  const messageOperations = messages ? {
    deleteMany: {},
    create: messages.map((m: any) => ({
      role: m.role,
      text: m.text,
      files: m.files ? JSON.stringify(m.files) : undefined,
      timestamp: m.timestamp
    }))
  } : undefined;

  try {
    const project = await prisma.project.upsert({
      where: { 
        id: id || 'new-project'
      },
      update: { 
        name, 
        files: JSON.stringify(files), 
        thumbnail,
        messages: messageOperations
      },
      create: { 
        name, 
        files: JSON.stringify(files), 
        userId: user.id,
        thumbnail,
        messages: messages ? {
          create: messages.map((m: any) => ({
            role: m.role,
            text: m.text,
            files: m.files ? JSON.stringify(m.files) : undefined,
            timestamp: m.timestamp
          }))
        } : undefined
      }
    });
    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

protectedRouter.get('/projects/:id', async (req: any, res) => {
  const user = req.user;
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: user.id },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    res.json({
        ...project,
        files: JSON.parse(project.files),
        messages: project.messages.map(m => ({
          ...m,
          files: m.files ? JSON.parse(m.files) : undefined
        }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load project' });
  }
});

protectedRouter.delete('/projects/:id', async (req: any, res) => {
    const user = req.user;
    try {
      await prisma.project.delete({
        where: { id: req.params.id, userId: user.id }
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete project' });
    }
});

protectedRouter.post('/publish/:id', async (req: any, res) => {
  const { id } = req.params;
  const { files } = req.body;
  const user = req.user;

  try {
    const project = await prisma.project.findFirst({
      where: { id, userId: user.id }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const sitePath = path.join(SITES_DIR, id);
    await fs.mkdir(sitePath, { recursive: true });
    
    // Clear existing
    await fs.rm(sitePath, { recursive: true, force: true });
    await fs.mkdir(sitePath, { recursive: true });

    await saveFilesToDisk(sitePath, files);

    const publicUrl = `http://localhost:${port}/sites/${id}/index.html`;
    res.json({ url: publicUrl });
  } catch (error) {
    console.error('Publish error:', error);
    res.status(500).json({ error: 'Failed to publish site' });
  }
});

async function saveFilesToDisk(basePath: string, files: any) {
  for (const name in files) {
    const node = files[name];
    const targetPath = path.join(basePath, name);
    if (node.file) {
      if (node.file.encoding === 'base64') {
        await fs.writeFile(targetPath, Buffer.from(node.file.contents, 'base64'));
      } else {
        await fs.writeFile(targetPath, node.file.contents);
      }
    } else if (node.directory) {
      await fs.mkdir(targetPath, { recursive: true });
      await saveFilesToDisk(targetPath, node.directory);
    }
  }
}

protectedRouter.post('/generate', async (req: any, res) => {
    const { prompt, previousFiles, provider, model, apiKey, images } = req.body;
    const user = req.user;

    // Determine API Key: User provided > User Settings > Server Env
    let effectiveApiKey = apiKey;
    const userSettings = user.settings ? JSON.parse(user.settings) : {};

    if (!effectiveApiKey) {
        effectiveApiKey = userSettings.apiKey;
    }

    if (!effectiveApiKey) {
      if (provider === 'gemini') {
          effectiveApiKey = process.env.GEMINI_API_KEY;
      } else {
          effectiveApiKey = process.env.ANTHROPIC_API_KEY;
      }
    }
  
    if (!effectiveApiKey) {
      return res.status(400).send({ 
          error: `No API Key provided for ${provider || 'Anthropic'}. Please enter one in settings.` 
      });
    }
  
    try {
      const llm = ProviderFactory.getProvider(provider);
      const result = await llm.generate({
          prompt,
          previousFiles,
          apiKey: effectiveApiKey,
          model: model || userSettings.model,
          images
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error calling LLM:', error);
      res.status(500).send({ error: error.message });
    }
});

protectedRouter.post('/generate-stream', async (req: any, res) => {
    const { prompt, previousFiles, provider, model, apiKey, images } = req.body;
    const user = req.user;

    let effectiveApiKey = apiKey;
    const userSettings = user.settings ? JSON.parse(user.settings) : {};
    if (!effectiveApiKey) effectiveApiKey = userSettings.apiKey;
    if (!effectiveApiKey) {
      effectiveApiKey = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
    }
  
    if (!effectiveApiKey) {
      return res.status(400).send({ error: `No API Key provided. Please enter one in settings.` });
    }
  
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const llm = ProviderFactory.getProvider(provider);
      const result = await llm.streamGenerate({
          prompt,
          previousFiles,
          apiKey: effectiveApiKey,
          model: model || userSettings.model,
          images
      }, {
          onText: (text) => {
              res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
          }
      });
      
      // Final result
      res.write(`data: ${JSON.stringify({ type: 'result', content: result })}\n\n`);
      res.end();
    } catch (error) {
      console.error('Error calling LLM:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
      res.end();
    }
});

app.use('/api', protectedRouter);

const port = process.env.PORT || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});
server.on('error', console.error);