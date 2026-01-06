import express from 'express';
import * as path from 'path';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import 'dotenv/config';
import * as fs from 'fs/promises';

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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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

const SYSTEM_PROMPT = `
You are an expert Angular developer. 
Your task is to generate or modify the SOURCE CODE for an Angular application.

**CRITICAL: You are working within an EXISTING project structure.**
DO NOT generate package.json, angular.json, or tsconfig.json.
DO NOT generate src/main.ts or src/index.html unless you need to change them.

Input Context:
- You will receive the "Current File Structure".
- If the user asks for a change, ONLY return the files that need to be modified or created.
- **DO NOT** return files that have not changed. This is critical to avoid response truncation.

Output:
- Return a JSON object representing the 'src' directory structure.
- The structure must be:
{
  "files": {
    "src": {
      "directory": {
        "app": {
          "directory": {
             "app.component.ts": { "file": { "contents": "..." } }
          }
        }
      }
    }
  },
  "explanation": "Brief explanation..."
}

RULES:
1. **Root Component:** Ensure 'src/app/app.component.ts' exists and has selector 'app-root'.
2. **Features:** Use Angular 18+ Standalone components.
3. **Styling:** Use inline styles in components or 'src/styles.css' for globals.
4. **Imports:** Ensure all imports are correct.
5. **Robustness:** The JSON MUST be valid.
6. **Conciseness:** Minimize comments. Use compact CSS.
`;

app.post('/api/generate', async (req, res) => {
  const { prompt, previousFiles } = req.body;

  let userMessage = prompt;
  if (previousFiles) {
      // optimization: Trim the previousFiles context to reduce input tokens if needed
      // For now, sending the full src tree is safer for context
      userMessage += `\n\n--- Current File Structure ---\n${JSON.stringify(previousFiles, null, 2)}`;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userMessage }
      ],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      let jsonString = content.text;
      
      const jsonMatch = content.text.match(/```json\n([\s\S]*?)\n```/) || 
                        content.text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        jsonString = jsonMatch[1] || jsonMatch[0];
      }

      try {
        // Use jsonrepair to fix truncated or malformed JSON
        const repairedJson = jsonrepair(jsonString);
        const result = JSON.parse(repairedJson);
        res.json(result);
      } catch (parseError) {
        console.error('Failed to parse JSON from Claude:', parseError);
        console.log('Raw output (start):', content.text.substring(0, 500));
        console.log('Raw output (end):', content.text.substring(content.text.length - 500));
        
        res.status(500).send({ 
          error: 'Could not parse JSON from Claude response',
          details: parseError.message,
          raw: content.text.substring(0, 2000) 
        });
      }
    } else {
      res.status(500).send({ error: 'Unexpected response type from Claude' });
    }
  }
  catch (error) {
    console.error('Error calling Claude:', error);
    res.status(500).send({ error: error.message });
  }
});

const port = process.env.PORT || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});
server.on('error', console.error);
