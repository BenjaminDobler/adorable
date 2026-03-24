import express from 'express';
import * as os from 'os';
import * as path from 'path';
import { authenticate } from '../middleware/auth';
import { requireCloudEditorAccess } from '../middleware/cloud-editor-access';
import { decrypt } from '../utils/crypto';
import { DiskFileSystem } from '../providers/filesystem/disk-filesystem';
import { FileSystemInterface } from '../providers/types';
import { AnthropicProvider } from '../providers/anthropic';
import { ANGULAR_KNOWLEDGE_BASE } from '../providers/base';
import { containerRegistry } from '../providers/container/container-registry';
import { nativeRegistry } from '../providers/container/native-registry';
import { kitService } from '../services/kit.service';
import { projectFsService } from '../services/project-fs.service';
import { prisma } from '../db/prisma';
import * as fsSync from 'fs';

const router = express.Router();
router.use(authenticate);

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

router.post('/', requireCloudEditorAccess, async (req: any, res) => {
  const {
    prompt, previousFiles, provider, model, apiKey, openFiles, forcedSkill,
    planMode, kitId, projectId, builtInTools, reasoningEffort, history, contextSummary
  } = req.body;
  const user = req.user;

  const userSettings = user.settings ? JSON.parse(user.settings) : {};

  const getApiKey = (p: string): string => {
    if (p === provider && apiKey && !apiKey.includes('...')) return apiKey;
    const profiles = userSettings.profiles || [];
    const profile = profiles.find((pr: any) => pr.provider === p);
    return profile?.apiKey ? decrypt(profile.apiKey) : 'preview-no-call';
  };

  let fileSystem: FileSystemInterface;

  try {
    let projectPath: string | null = null;

    if (projectId) {
      try {
        const manager = containerRegistry.getManager(user.id);
        if (manager?.isRunning()) {
          const info = await manager.getContainerInfo();
          if (info) projectPath = info.hostProjectPath;
        }
      } catch { /* no docker */ }

      if (!projectPath) {
        try {
          const nativeManager = nativeRegistry.getManager(user.id);
          if (nativeManager?.isRunning()) {
            projectPath = nativeManager.getProjectPath() || null;
          }
        } catch { /* no native */ }
      }

      if (!projectPath) {
        const project = await prisma.project.findFirst({
          where: { id: projectId },
          select: { externalPath: true }
        });
        projectPath = project?.externalPath || projectFsService.getProjectPath(projectId);
        if (!fsSync.existsSync(projectPath)) fsSync.mkdirSync(projectPath, { recursive: true });
      }
    } else {
      projectPath = path.join(os.tmpdir(), 'adorable-context-preview', user.id);
      if (!fsSync.existsSync(projectPath)) fsSync.mkdirSync(projectPath, { recursive: true });
    }

    fileSystem = new DiskFileSystem(projectPath);
  } catch (e: any) {
    console.error('[ContextPreview] Failed to resolve file system:', e);
    return res.status(500).json({ error: 'Failed to resolve project file system' });
  }

  const activeKit = kitId ? (await kitService.getById(kitId, user.id)) || undefined : undefined;

  try {
    const providerInstance = new AnthropicProvider();
    const ctx = await (providerInstance as any).prepareAgentContext({
      prompt,
      previousFiles,
      openFiles,
      forcedSkill,
      planMode,
      activeKit,
      kitLessonsEnabled: userSettings.kitLessonsEnabled,
      builtInTools,
      reasoningEffort,
      history,
      contextSummary,
      fileSystem,
      apiKey: getApiKey(provider || 'anthropic'),
      model: model || userSettings.model || 'claude-sonnet-4-5-20250929',
      userId: user.id,
      projectId,
      skipVisualEditingIds: userSettings.skipVisualEditingIds,
    }, 'anthropic');

    const knowledgeBase = ANGULAR_KNOWLEDGE_BASE;
    const historyText = JSON.stringify(ctx.history || []);

    const result = {
      systemPrompt: ctx.effectiveSystemPrompt,
      knowledgeBase,
      userMessage: ctx.userMessage,
      history: ctx.history || [],
      contextSummary: ctx.contextSummary || null,
      estimatedTokens: {
        systemPrompt: estimateTokens(ctx.effectiveSystemPrompt),
        knowledgeBase: estimateTokens(knowledgeBase),
        userMessage: estimateTokens(ctx.userMessage),
        history: estimateTokens(historyText),
        contextSummary: estimateTokens(ctx.contextSummary || ''),
        total: estimateTokens(ctx.effectiveSystemPrompt)
          + estimateTokens(knowledgeBase)
          + estimateTokens(ctx.userMessage)
          + estimateTokens(historyText)
          + estimateTokens(ctx.contextSummary || ''),
      }
    };

    res.json(result);
  } catch (e: any) {
    console.error('[ContextPreview] Error assembling context:', e);
    res.status(500).json({ error: e.message });
  }
});

export const contextPreviewRouter = router;
