import express from 'express';
import { ProviderFactory } from '../providers/factory';
import { SmartRouter } from '../providers/router';
import { decrypt } from '../utils/crypto';
import { authenticate } from '../middleware/auth';

const router = express.Router();
const aiSmartRouter = new SmartRouter();

router.use(authenticate);

router.get('/models/:provider', async (req: any, res) => {
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

router.post('/generate', async (req: any, res) => {
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
          const decision = await aiSmartRouter.route(prompt, smartRouting || userSettings.smartRouting, getApiKey);
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

router.post('/generate-stream', async (req: any, res) => {
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
          const decision = await aiSmartRouter.route(prompt, smartRouting || userSettings.smartRouting, getApiKey);
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
      
      res.write(`data: ${JSON.stringify({ type: 'result', content: result })}\n\n`);
      res.end();
    } catch (error) {
      console.error('Error calling LLM:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
      res.end();
    }
});

export const aiRouter = router;
