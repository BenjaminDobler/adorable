import express from 'express';
import { ProviderFactory } from '../providers/factory';
import { SmartRouter } from '../providers/router';
import { decrypt } from '../utils/crypto';
import { authenticate } from '../middleware/auth';
import { containerRegistry } from '../providers/container/container-registry';
import { ContainerFileSystem } from '../providers/filesystem/container-filesystem';
import { screenshotManager } from '../providers/screenshot-manager';
import { questionManager } from '../providers/question-manager';
import { MCPServerConfig } from '../mcp/types';

const router = express.Router();
const aiSmartRouter = new SmartRouter();

router.use(authenticate);

/**
 * Load and decrypt MCP server configs from user settings
 */
function loadMCPConfigs(userSettings: any): MCPServerConfig[] {
  if (!userSettings?.mcpServers || !Array.isArray(userSettings.mcpServers)) {
    return [];
  }

  return userSettings.mcpServers
    .filter((server: MCPServerConfig) => server.enabled)
    .map((server: MCPServerConfig) => {
      // Decrypt API key if present and encrypted
      if (server.apiKey && !server.apiKey.includes('...')) {
        try {
          // Check if it looks encrypted (contains colon separator for iv:encrypted format)
          if (server.apiKey.includes(':')) {
            return { ...server, apiKey: decrypt(server.apiKey) };
          }
        } catch (e) {
          console.error(`Failed to decrypt MCP API key for server "${server.name}":`, e);
        }
      }
      return server;
    });
}

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

    const getBaseUrl = (p: string) => {
       const profiles = userSettings.profiles || [];
       const profile = profiles.find((pr: any) => pr.provider === p);
       return profile?.baseUrl;
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

      // Load MCP configs
      const mcpConfigs = loadMCPConfigs(userSettings);

      const result = await llm.generate({
          prompt,
          previousFiles,
          apiKey: effectiveApiKey,
          model: finalModel,
          images,
          openFiles,
          userId: user.id,
          mcpConfigs,
          baseUrl: getBaseUrl(provider)
      });

      res.json(result);
    } catch (error) {
      console.error('Error calling LLM:', error);
      res.status(500).send({ error: error.message });
    }
});

router.post('/generate-stream', async (req: any, res) => {
    let { prompt, previousFiles, provider, model, apiKey, images, smartRouting, openFiles, use_container_context, forcedSkill, planMode } = req.body;
    const user = req.user;

    // Debug: Log images received
    if (images && images.length > 0) {
      console.log(`[Generate] Received ${images.length} image(s) in request`);
      images.forEach((img: string, i: number) => {
        console.log(`[Generate] Image ${i + 1}: ${img.substring(0, 50)}...`);
      });
    } else {
      console.log('[Generate] No images in request');
    }

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

    const getBaseUrl = (p: string) => {
       const profiles = userSettings.profiles || [];
       const profile = profiles.find((pr: any) => pr.provider === p);
       return profile?.baseUrl;
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

    // Auto-enable agent mode when a container is available (Docker/Native)
    let fileSystem;
    try {
       const manager = containerRegistry.getManager(user.id);
       if (manager && manager.isRunning()) {
          fileSystem = new ContainerFileSystem(manager);
          console.log(`[AgentMode] Auto-enabled for user ${user.id}`);
       }
    } catch (e) {
       // No container available — fall back to memory mode (WebContainer)
       if (use_container_context) {
          console.warn(`[AgentMode] Requested but no container available: ${e.message}. Using memory mode.`);
       }
    }

    try {
      const llm = ProviderFactory.getProvider(provider);

      let finalModel = model;
      if (!finalModel || finalModel === 'auto') finalModel = userSettings.model;
      if (!finalModel || finalModel === 'auto') finalModel = 'claude-3-5-sonnet-20240620';

      // Load MCP configs
      const mcpConfigs = loadMCPConfigs(userSettings);
      console.log(`[AI] Loaded ${mcpConfigs.length} MCP server config(s)`);
      if (mcpConfigs.length > 0) {
        console.log(`[AI] MCP servers:`, mcpConfigs.map(c => ({ name: c.name, url: c.url, enabled: c.enabled })));
      }

      const result = await llm.streamGenerate({
          prompt,
          previousFiles, // Still passed for fallback or initial context
          apiKey: effectiveApiKey,
          model: finalModel,
          images,
          openFiles,
          fileSystem,
          userId: user.id,
          forcedSkill,
          mcpConfigs,
          planMode,
          baseUrl: getBaseUrl(provider)
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
          onToolResult: (tool_use_id, result, name) => {
              res.write(`data: ${JSON.stringify({ type: 'tool_result', tool_use_id, result, name })}\n\n`);
          },
          onTokenUsage: (usage) => {
              res.write(`data: ${JSON.stringify({ type: 'usage', usage })}\n\n`);
          },
          onFileWritten: (path, content) => {
              res.write(`data: ${JSON.stringify({ type: 'file_written', path, content })}\n\n`);
          },
          onFileProgress: (path, content, isComplete) => {
              res.write(`data: ${JSON.stringify({ type: 'file_progress', path, content, isComplete })}\n\n`);
          },
          onScreenshotRequest: (requestId) => {
              res.write(`data: ${JSON.stringify({ type: 'screenshot_request', requestId })}\n\n`);
          },
          onQuestionRequest: (requestId, questions, context) => {
              res.write(`data: ${JSON.stringify({ type: 'question_request', requestId, questions, context })}\n\n`);
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

// Screenshot endpoint - client POSTs captured screenshot here
router.post('/screenshot/:requestId', async (req: any, res) => {
    const { requestId } = req.params;
    const { imageData, error } = req.body;

    if (error) {
        const resolved = screenshotManager.rejectScreenshot(requestId, error);
        return res.json({ success: resolved, message: resolved ? 'Error reported' : 'No pending request' });
    }

    if (!imageData) {
        return res.status(400).json({ success: false, message: 'No imageData provided' });
    }

    const resolved = screenshotManager.resolveScreenshot(requestId, imageData);
    res.json({ success: resolved, message: resolved ? 'Screenshot received' : 'No pending request found' });
});

// Question answer endpoint - client POSTs answers here
router.post('/question/:requestId', async (req: any, res) => {
    const { requestId } = req.params;
    const { answers, cancelled } = req.body;

    if (cancelled) {
        const resolved = questionManager.cancelRequest(requestId);
        return res.json({ success: resolved, message: resolved ? 'Request cancelled' : 'No pending request' });
    }

    if (!answers) {
        return res.status(400).json({ success: false, message: 'No answers provided' });
    }

    const resolved = questionManager.resolveAnswers(requestId, answers);
    res.json({ success: resolved, message: resolved ? 'Answers received' : 'No pending request found' });
});

export const aiRouter = router;