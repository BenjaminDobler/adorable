import express from 'express';
import { authenticate } from '../middleware/auth';
import { decrypt } from '../utils/crypto';
import { sessionAnalyzerService } from '../services/session-analyzer.service';
import { kitFsService } from '../services/kit-fs.service';
import { parseUserSettings } from '../services/user-settings.service';
import { SessionSuggestion } from '@adorable/shared-types';
import { SapAiCoreConfig } from '../providers/types';

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/sessions?projectId=xxx
 * List recent debug log sessions, optionally filtered by project.
 */
router.get('/', async (req: any, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const sessions = await sessionAnalyzerService.listSessions(projectId);
    res.json({ sessions });
  } catch (error: any) {
    console.error('[SessionAnalyzer] Failed to list sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * POST /api/sessions/analyze
 * Analyze a session log with AI. Streams SSE events.
 * Body: { filename, projectId?, kitId? }
 */
router.post('/analyze', async (req: any, res) => {
  const { filename, kitId } = req.body;
  const user = req.user;

  if (!filename) {
    return res.status(400).json({ error: 'filename is required' });
  }

  // Resolve API key and provider config
  const userSettings = parseUserSettings(user.settings);

  const getApiKey = (providerName: string) => {
    const profile = userSettings.profiles.find((p) => p.provider === providerName);
    if (profile?.apiKey) {
      return decrypt(profile.apiKey);
    }
    return undefined;
  };

  const getBaseUrl = (providerName: string): string | undefined => {
    const profile = userSettings.profiles.find((p) => p.provider === providerName);
    return profile?.baseUrl || undefined;
  };

  const getSapConfig = (): SapAiCoreConfig | undefined => {
    const profile = userSettings.profiles.find((p) => p.provider === 'anthropic');
    if (!profile?.sapAiCore?.enabled) return undefined;
    return {
      authUrl: profile.sapAiCore.authUrl,
      clientId: profile.sapAiCore.clientId,
      clientSecret: decrypt(profile.sapAiCore.clientSecret),
      resourceGroup: profile.sapAiCore.resourceGroup || 'default',
      baseUrl: profile.baseUrl ?? '',
    };
  };

  let apiKey = getApiKey('anthropic');
  let provider = 'anthropic';
  let baseUrl = getBaseUrl('anthropic');
  let sapAiCore = getSapConfig();

  // SAP AI Core uses OAuth, not API keys
  if (sapAiCore) {
    apiKey = 'sap-managed';
  } else if (!apiKey) {
    apiKey = getApiKey('gemini');
    provider = 'gemini';
    baseUrl = getBaseUrl('gemini');
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'No API key configured. Please add an Anthropic or Gemini API key in settings.' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Step 1: Parse log
    send({ type: 'progress', message: 'Parsing session log...' });
    const events = await sessionAnalyzerService.parseLogFile(filename);

    if (events.length === 0) {
      send({ type: 'error', error: 'Log file is empty or unreadable' });
      res.end();
      return;
    }

    // Step 2: Extract metrics
    const metrics = sessionAnalyzerService.extractMetrics(events);

    const overview = {
      provider: metrics.provider,
      model: metrics.model,
      turns: metrics.turns,
      timestamp: metrics.timestamp,
      promptSummary: metrics.promptSummary,
      kitName: metrics.kitName,
      buildAttempts: metrics.buildAttempts,
      buildSuccesses: metrics.buildSuccesses,
      buildFailures: metrics.buildFailures,
      toolCallCount: metrics.toolCallCount,
      errorCount: metrics.errorCount,
    };

    send({ type: 'overview', overview });

    // Step 3: Read kit docs if kitId provided
    let kitDocs: Record<string, string> | undefined;
    if (kitId) {
      send({ type: 'progress', message: 'Reading kit documentation...' });
      try {
        kitDocs = await kitFsService.readKitAdorableFiles(kitId);
      } catch {
        // Kit docs not available, continue without them
      }
    }

    // Step 4: Build prompt and call AI
    send({ type: 'progress', message: 'Analyzing with AI...' });
    const prompt = sessionAnalyzerService.buildAnalysisPrompt(events, metrics, kitDocs);
    const suggestions = await sessionAnalyzerService.analyzeWithAI(prompt, apiKey, undefined, provider, sapAiCore, baseUrl);

    // Step 5: Stream suggestions
    for (const suggestion of suggestions) {
      // Attach kitId to patches if relevant
      if (suggestion.patch && kitId && !suggestion.patch.kitId) {
        suggestion.patch.kitId = kitId;
      }
      send({ type: 'suggestion', suggestion });
    }

    send({ type: 'complete' });
  } catch (error: any) {
    console.error('[SessionAnalyzer] Analysis failed:', error);
    send({ type: 'error', error: error.message || 'Analysis failed' });
  }

  res.end();
});

/**
 * POST /api/sessions/apply
 * Apply a suggestion's patch.
 * Body: { suggestion: SessionSuggestion }
 */
router.post('/apply', async (req: any, res) => {
  const { suggestion } = req.body as { suggestion: SessionSuggestion };

  if (!suggestion) {
    return res.status(400).json({ success: false, error: 'suggestion is required' });
  }

  try {
    switch (suggestion.type) {
      case 'kit_doc_improvement': {
        if (!suggestion.patch?.kitId || !suggestion.patch?.filePath || !suggestion.patch?.newContent) {
          return res.json({ success: false, error: 'Missing patch data for kit doc improvement' });
        }
        await kitFsService.writeKitAdorableFiles(suggestion.patch.kitId, {
          [suggestion.patch.filePath]: suggestion.patch.newContent,
        });
        return res.json({ success: true });
      }

      case 'system_prompt_improvement':
      case 'kit_config':
      case 'project_structure': {
        if (!suggestion.patch?.filePath || !suggestion.patch?.newContent) {
          return res.json({ success: false, error: 'Missing patch data' });
        }
        if (suggestion.patch.kitId) {
          await kitFsService.writeKitAdorableFiles(suggestion.patch.kitId, {
            [suggestion.patch.filePath]: suggestion.patch.newContent,
          });
        }
        return res.json({ success: true });
      }

      case 'workflow_recommendation':
        // Advice only, nothing to apply
        return res.json({ success: true });

      default:
        return res.json({ success: false, error: `Unknown suggestion type: ${suggestion.type}` });
    }
  } catch (error: any) {
    console.error('[SessionAnalyzer] Apply failed:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to apply suggestion' });
  }
});

export const sessionAnalyzerRouter = router;
