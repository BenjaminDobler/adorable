import express from 'express';
import * as path from 'path';
import cors from 'cors';
import { jsonrepair } from 'jsonrepair';
import 'dotenv/config';
import * as fs from 'fs/promises';
import { ProviderFactory } from './providers/factory';
import { SmartRouter } from './providers/router';
import { prisma } from './db/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { encrypt, decrypt } from './utils/crypto';
import { DockerManager } from './providers/container/docker-manager';
import { createProxyMiddleware } from 'http-proxy-middleware';

const JWT_SECRET = process.env['JWT_SECRET'] || 'fallback-secret';

const app = express();
const router = new SmartRouter();
const dockerManager = new DockerManager(); // Singleton for local dev

app.use(cors());

// Proxy for Container Preview
app.use('/api/proxy', createProxyMiddleware({
  target: 'http://localhost:4200', // Default fallback
  router: async () => {
     try {
       return await dockerManager.getContainerUrl();
     } catch(e) {
       return 'http://localhost:4200'; // Fallback
     }
  },
  pathRewrite: {
    '^/api/proxy': ''
  },
  changeOrigin: true,
  ws: true,
  on: {
    proxyRes: (proxyRes, req, res) => {
       res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
       res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }
  },
  logger: console // Debug
}));

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

// --- Container Routes (Local Dev) ---

protectedRouter.post('/container/start', async (req: any, res) => {
  try {
    const id = await dockerManager.createContainer();
    res.json({ id });
  } catch (e) {
    console.error('Failed to start container', e);
    res.status(500).json({ error: e.message });
  }
});

protectedRouter.post('/container/stop', async (req: any, res) => {
  try {
    await dockerManager.stop();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

protectedRouter.post('/container/mount', async (req: any, res) => {
  const { files } = req.body;
  try {
    await dockerManager.copyFiles(files);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

protectedRouter.post('/container/exec', async (req: any, res) => {
  const { cmd, args, workDir } = req.body;
  try {
    // Reconstruct full command array
    const fullCmd = [cmd, ...(args || [])];
    const result = await dockerManager.exec(fullCmd, workDir);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

protectedRouter.get('/container/exec-stream', async (req: any, res) => {
  const cmd = req.query.cmd as string;
  const args = req.query.args ? (req.query.args as string).split(',') : [];
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const fullCmd = [cmd, ...args];
    await dockerManager.execStream(fullCmd, '/app', (chunk) => {
       res.write(`data: ${JSON.stringify({ output: chunk })}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

// Critical headers for WebContainers (Applied to ALL responses)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/sites', express.static(SITES_DIR));

app.get('/api/models/:provider', authenticate, async (req: any, res) => {
  const { provider } = req.params;
  let apiKey = req.headers['x-api-key'] as string;
  const user = req.user;

  // Security: If key is masked or missing, try to load from DB
  if (!apiKey || apiKey.includes('...')) {
      if (user.settings) {
          try {
              const settings = JSON.parse(user.settings);
              const profiles = settings.profiles || [];
              const profile = profiles.find((p: any) => p.provider === provider || (provider === 'google' && p.provider === 'gemini'));
              
              if (profile && profile.apiKey) {
                  apiKey = decrypt(profile.apiKey);
              }
          } catch (e) {
              console.error('Error reading user settings for models', e);
          }
      }
  }

  if (!apiKey || apiKey.includes('...')) return res.status(400).json({ error: 'API Key required' });

  try {
    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      // Filter for Claude models, sort by latest
      const models = data.data
        .filter((m: any) => m.id.includes('claude'))
        .map((m: any) => m.id)
        .sort()
        .reverse();
      res.json(models);
    } else if (provider === 'google') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      const models = data.models
        .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''));
      res.json(models);
    } else {
      res.status(400).json({ error: 'Unknown provider' });
    }
  } catch (error: any) {
    console.error('Failed to fetch models', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate', async (req, res) => {


  res.send({ status: 'ok' });
});

// --- User Profile Routes ---

protectedRouter.get('/profile', async (req: any, res) => {
  const { password, ...userWithoutPassword } = req.user;
  
  if (userWithoutPassword.settings) {
     try {
       const settings = JSON.parse(userWithoutPassword.settings);
       if (settings.profiles) {
          settings.profiles = settings.profiles.map((p: any) => {
             if (p.apiKey) {
                try {
                   const decrypted = decrypt(p.apiKey);
                   // Mask: sk-ant...1234
                   p.apiKey = decrypted.substring(0, 7) + '...' + decrypted.substring(decrypted.length - 4);
                } catch(e) {
                   p.apiKey = '********';
                }
             }
             return p;
          });
       }
       userWithoutPassword.settings = JSON.stringify(settings);
     } catch (e) {
       console.error('Failed to parse settings for masking', e);
     }
  }
  
  res.json(userWithoutPassword);
});

protectedRouter.post('/profile', async (req: any, res) => {
  const user = req.user;
  const { name, settings } = req.body;

  try {
    let finalSettingsString = undefined;

    if (settings !== undefined) {
       // Fetch existing to handle masked keys
       const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
       const currentSettings = currentUser?.settings ? JSON.parse(currentUser.settings) : {};
       const existingProfiles = currentSettings.profiles || [];

       const newProfiles = settings.profiles || [];
       
       const processedProfiles = newProfiles.map((p: any) => {
          // Check if this profile existed
          const existing = existingProfiles.find((ep: any) => ep.id === p.id || ep.provider === p.provider);
          
          if (p.apiKey) {
             // If key is masked (contains ...), keep the existing encrypted key
             if (p.apiKey.includes('...')) {
                return { ...p, apiKey: existing ? existing.apiKey : '' }; // Keep existing encrypted
             }
             // Otherwise it's a new cleartext key, encrypt it
             return { ...p, apiKey: encrypt(p.apiKey) };
          }
          return p;
       });
       
       finalSettingsString = JSON.stringify({ ...settings, profiles: processedProfiles });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name !== undefined ? name : undefined,
        settings: finalSettingsString
      }
    });
    
    // Return masked
    const userSettings = updatedUser.settings ? JSON.parse(updatedUser.settings) : {};
    if (userSettings.profiles) {
        userSettings.profiles = userSettings.profiles.map((p: any) => {
            if (p.apiKey) {
                // Return mask. We assume encrypted keys are long enough.
                // Decrypting just to verify? No need.
                return { ...p, apiKey: p.apiKey.substring(0, 3) + '...' + p.apiKey.substring(p.apiKey.length - 4) }; 
                // Wait, if p.apiKey is the ENCRYPTED string (hex), masking it looks weird.
                // Ideally we return a generic mask like '••••••••' or 'sk-ant...'.
                // If we want to show 'sk-ant...', we need to decrypt it first.
                try {
                   const decrypted = decrypt(p.apiKey);
                   return { ...p, apiKey: decrypted.substring(0, 7) + '...' + decrypted.substring(decrypted.length - 4) };
                } catch (e) {
                   return { ...p, apiKey: '********' };
                }
            }
            return p;
        });
    }
    
    res.json({ ...updatedUser, settings: JSON.stringify(userSettings), password: undefined });
  } catch (error) {
    console.error(error);
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

  console.log(`[Save Project] Request for '${name}' (ID: ${id}) by ${user.email}`);

  if (!name || !files) {
    return res.status(400).json({ error: 'Name and files are required' });
  }

  try {
    let project;
    
    // Message operations for both create and update
    const messageCreateData = messages ? messages.map((m: any) => ({
      role: m.role,
      text: m.text,
      files: m.files ? JSON.stringify(m.files) : undefined,
      usage: m.usage ? JSON.stringify(m.usage) : undefined,
      timestamp: m.timestamp
    })) : [];

    if (id && id !== 'new-project' && id !== 'new') {
      // Update existing project
      console.log(`[Save Project] Updating existing project ${id}`);
      project = await prisma.project.update({
        where: { id: id, userId: user.id },
        data: {
          name,
          files: JSON.stringify(files),
          thumbnail,
          messages: messages ? {
            deleteMany: {}, // Clear old messages
            create: messageCreateData
          } : undefined
        }
      });
    } else {
      // Create new project
      console.log(`[Save Project] Creating new project`);
      project = await prisma.project.create({
        data: {
          name,
          files: JSON.stringify(files),
          userId: user.id,
          thumbnail,
          messages: {
            create: messageCreateData
          }
        }
      });
    }
    console.log(`[Save Project] Success. Project ID: ${project.id}`);
    res.json(project);
  } catch (error) {
    console.error('[Save Project] Error:', error);
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
          files: m.files ? JSON.parse(m.files) : undefined,
          usage: m.usage ? JSON.parse(m.usage) : undefined
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
    let { prompt, previousFiles, provider, model, apiKey, images, smartRouting, openFiles } = req.body;
    const user = req.user;

    const userSettings = user.settings ? JSON.parse(user.settings) : {};

    const getApiKey = (p: string) => {
       // 1. Check direct override (if provided explicitly in UI, though discouraged)
       if (p === provider && apiKey && !apiKey.includes('...')) return apiKey;
       
       // 2. Load from Profile
       const profiles = userSettings.profiles || [];
       const profile = profiles.find((pr: any) => pr.provider === p);
       if (profile && profile.apiKey) {
          return decrypt(profile.apiKey);
       }
       return undefined;
    };

    if (model === 'auto') {
       try {
          const decision = await router.route(prompt, smartRouting || userSettings.smartRouting, getApiKey);
          provider = decision.provider;
          model = decision.model;
          apiKey = decision.apiKey;
       } catch (err) {
          console.error('Routing failed:', err);
          provider = 'anthropic';
          model = 'claude-3-5-sonnet-20240620';
          apiKey = getApiKey('anthropic');
       }
    }

    let effectiveApiKey = apiKey;
    if (!effectiveApiKey || effectiveApiKey.includes('...')) effectiveApiKey = getApiKey(provider);
  
    if (!effectiveApiKey) {
      return res.status(400).send({ 
          error: `No API Key provided for ${provider || 'Anthropic'}. Please enter one in settings.` 
      });
    }
  
    try {
      const llm = ProviderFactory.getProvider(provider);
      // Ensure model is not "auto" before calling LLM
      let finalModel = model;
      if (!finalModel || finalModel === 'auto') finalModel = userSettings.model;
      if (!finalModel || finalModel === 'auto') finalModel = 'claude-3-5-sonnet-20240620';

      const result = await llm.generate({
          prompt,
          previousFiles,
          apiKey: effectiveApiKey,
          model: finalModel,
          images,
          openFiles
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error calling LLM:', error);
      res.status(500).send({ error: error.message });
    }
});

protectedRouter.post('/generate-stream', async (req: any, res) => {
    let { prompt, previousFiles, provider, model, apiKey, images, smartRouting, openFiles } = req.body;
    const user = req.user;

    const userSettings = user.settings ? JSON.parse(user.settings) : {};
    
    const getApiKey = (p: string) => {
       if (p === provider && apiKey && !apiKey.includes('...')) return apiKey;
       const profiles = userSettings.profiles || [];
       const profile = profiles.find((pr: any) => pr.provider === p);
       if (profile && profile.apiKey) {
          return decrypt(profile.apiKey);
       }
       return undefined;
    };

    if (model === 'auto') {
       try {
          const decision = await router.route(prompt, smartRouting || userSettings.smartRouting, getApiKey);
          provider = decision.provider;
          model = decision.model;
          apiKey = decision.apiKey;
       } catch (err) {
          console.error('Routing failed:', err);
          provider = 'anthropic';
          model = 'claude-3-5-sonnet-20240620';
          apiKey = getApiKey('anthropic');
       }
    }

    let effectiveApiKey = apiKey;
    if (!effectiveApiKey || effectiveApiKey.includes('...')) effectiveApiKey = getApiKey(provider);
  
    if (!effectiveApiKey) {
      return res.status(400).send({ error: `No API Key provided for ${provider}. Please enter one in settings.` });
    }
  
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const llm = ProviderFactory.getProvider(provider);
      
      let finalModel = model;
      if (!finalModel || finalModel === 'auto') finalModel = userSettings.model;
      if (!finalModel || finalModel === 'auto') finalModel = 'claude-3-5-sonnet-20240620';

      const result = await llm.streamGenerate({
          prompt,
          previousFiles,
          apiKey: effectiveApiKey,
          model: finalModel,
          images,
          openFiles
      }, {
          onText: (text) => {
              res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
          },
          onToolDelta: (index, delta) => {
              res.write(`data: ${JSON.stringify({ type: 'tool_delta', index, delta })}\n\n`);
          },
          onToolCall: (index, name, args) => {
              res.write(`data: ${JSON.stringify({ type: 'tool_call', index, name, args })}\n\n`);
          },
          onToolResult: (tool_use_id, result) => {
              res.write(`data: ${JSON.stringify({ type: 'tool_result', tool_use_id, result })}\n\n`);
          },
          onTokenUsage: (usage) => {
              res.write(`data: ${JSON.stringify({ type: 'usage', usage })}\n\n`);
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