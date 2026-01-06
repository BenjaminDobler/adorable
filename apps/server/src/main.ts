import express from 'express';
import * as path from 'path';
import cors from 'cors';
import { jsonrepair } from 'jsonrepair';
import 'dotenv/config';
import * as fs from 'fs/promises';
import { ProviderFactory } from './providers/factory';
import { prisma } from './db/prisma';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Auth Simulation Middleware ---
// In a real app with Supabase, this would verify a JWT.
// For now, we'll use a hardcoded user or a header.
app.use(async (req, res, next) => {
  const userId = req.headers['x-user-id'] as string || 'default-user';
  const userEmail = req.headers['x-user-email'] as string || 'hello@adorable.dev';

  // Ensure user exists in DB
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    user = await prisma.user.create({
      data: { id: userId, email: userEmail, name: 'Adorable Developer' }
    });
  }
  
  (req as any).user = user;
  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} (User: ${(req as any).user?.id})`);
  next();
});

// ... existing headers middleware ...

app.get('/api', (req, res) => {
  res.send({ message: 'Welcome to server!', user: (req as any).user });
});

// --- User Profile Routes ---

// Get current user profile
app.get('/api/profile', async (req, res) => {
  const user = (req as any).user;
  res.json(user);
});

// Update current user profile/settings
app.post('/api/profile', async (req, res) => {
  const user = (req as any).user;
  const { name, settings } = req.body;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name !== undefined ? name : undefined,
        settings: settings !== undefined ? JSON.stringify(settings) : undefined
      }
    });
    res.json(updatedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// --- End User Profile Routes ---

// --- Project Persistence Routes (PRISMA) ---

// List all projects for current user
app.get('/api/projects', async (req, res) => {
  const user = (req as any).user;
  try {
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      select: { name: true, id: true }
    });
    res.json(projects.map(p => p.name));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Save a project
app.post('/api/projects', async (req, res) => {
  const { name, files } = req.body;
  const user = (req as any).user;

  if (!name || !files) {
    return res.status(400).json({ error: 'Name and files are required' });
  }

  try {
    const project = await prisma.project.upsert({
      where: { 
        // Note: In real app, we'd probably use ID, but for this UI we'll match on Name + User
        id: (await prisma.project.findFirst({ where: { name, userId: user.id } }))?.id || 'new-id'
      },
      update: { files: JSON.stringify(files) },
      create: { 
        name, 
        files: JSON.stringify(files), 
        userId: user.id 
      }
    });
    res.json({ message: 'Project saved', name: project.name });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// Load a project
app.get('/api/projects/:name', async (req, res) => {
  const user = (req as any).user;
  try {
    const project = await prisma.project.findFirst({
      where: { name: req.params.name, userId: user.id }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(JSON.parse(project.files));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load project' });
  }
});

// --- End Project Persistence Routes ---

app.post('/api/generate', async (req, res) => {
  const { prompt, previousFiles, provider, model, apiKey, images } = req.body;

  // Determine API Key: User provided > Server Env
  let effectiveApiKey = apiKey;
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
        model,
        images
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error calling LLM:', error);
    res.status(500).send({ error: error.message });
  }
});

const port = process.env.PORT || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});
server.on('error', console.error);
