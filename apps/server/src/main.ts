import express from 'express';
import * as path from 'path';
import cors from 'cors';
import { jsonrepair } from 'jsonrepair';
import 'dotenv/config';
import * as fs from 'fs/promises';
import { ProviderFactory } from './providers/factory';

const app = express();

const PROJECTS_DIR = path.join(__dirname, '../saved-projects');
fs.mkdir(PROJECTS_DIR, { recursive: true }).catch(console.error);

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for large payloads

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Critical headers for WebContainers
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/api', (req, res) => {
  res.send({ message: 'Welcome to server!' });
});

// --- Project Persistence Routes ---

app.get('/api/projects', async (req, res) => {
  try {
    const files = await fs.readdir(PROJECTS_DIR);
    const projects = files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

app.post('/api/projects', async (req, res) => {
  const { name, files } = req.body;
  if (!name || !files) {
    return res.status(400).json({ error: 'Name and files are required' });
  }
  
  const safeName = name.replace(/[^a-z0-9-_]/gi, '_');
  const filePath = path.join(PROJECTS_DIR, `${safeName}.json`);

  try {
    await fs.writeFile(filePath, JSON.stringify(files, null, 2));
    res.json({ message: 'Project saved', name: safeName });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

app.get('/api/projects/:name', async (req, res) => {
  const safeName = req.params.name.replace(/[^a-z0-9-_]/gi, '_');
  const filePath = path.join(PROJECTS_DIR, `${safeName}.json`);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(404).json({ error: 'Project not found' });
  }
});

// --- End Project Persistence Routes ---

app.post('/api/generate', async (req, res) => {
  const { prompt, previousFiles, provider, model, apiKey } = req.body;

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
        model
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
