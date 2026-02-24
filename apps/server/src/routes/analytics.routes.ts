import express from 'express';
import { prisma } from '../db/prisma';
import { authenticate } from '../middleware/auth';
import { calculateCost, PRICING_TABLE, ModelPricing } from '../providers/pricing';

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/analytics/usage?range=30d&projectId=optional
 * Returns aggregated token usage and cost analytics for the authenticated user.
 */
router.get('/usage', async (req: any, res) => {
  const user = req.user;
  const range = (req.query.range as string) || '30d';
  const projectId = req.query.projectId as string | undefined;

  try {
    // Calculate date filter
    let dateFilter: Date | undefined;
    if (range !== 'all') {
      const days = parseInt(range.replace('d', ''), 10) || 30;
      dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - days);
    }

    // Build where clause
    const where: any = {
      project: { userId: user.id },
      usage: { not: null },
      role: 'assistant',
    };
    if (projectId) {
      where.projectId = projectId;
    }
    if (dateFilter) {
      where.timestamp = { gte: dateFilter };
    }

    // Determine fallback model from user settings for old messages without stored model
    // Prefer the Anthropic profile model since most old generations used Anthropic
    const userSettings = user.settings ? JSON.parse(user.settings) : {};
    const profiles = userSettings.profiles || [];
    const anthropicProfile = profiles.find((p: any) => p.provider === 'anthropic');
    const activeProfile = profiles.find((p: any) => p.id === userSettings.activeProfileId);
    const fallbackModel = anthropicProfile?.model || activeProfile?.model || 'claude-sonnet-4-5-20250929';

    // Fetch messages with usage data
    const messages = await prisma.chatMessage.findMany({
      where,
      select: {
        usage: true,
        model: true,
        timestamp: true,
        projectId: true,
        project: { select: { name: true } },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Aggregate
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let totalGenerations = 0;

    const byDayMap: Record<string, { date: string; inputTokens: number; outputTokens: number; cost: number }> = {};
    const byModelMap: Record<string, { model: string; inputTokens: number; outputTokens: number; cost: number; count: number }> = {};
    const byProjectMap: Record<string, { projectId: string; projectName: string; inputTokens: number; outputTokens: number; cost: number; count: number }> = {};

    for (const msg of messages) {
      if (!msg.usage) continue;

      let usage: any;
      try {
        usage = typeof msg.usage === 'string' ? JSON.parse(msg.usage) : msg.usage;
      } catch {
        continue;
      }

      const inputTokens = usage.inputTokens || 0;
      const outputTokens = usage.outputTokens || 0;
      const effectiveModel = msg.model || fallbackModel;

      // Get cost: use stored cost if available, otherwise compute retroactively
      let messageCost = 0;
      if (usage.cost?.totalCost !== undefined) {
        messageCost = usage.cost.totalCost;
      } else {
        const computed = calculateCost(usage, effectiveModel, userSettings.customPricing);
        messageCost = computed.totalCost;
      }

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCost += messageCost;
      totalGenerations++;

      // By day
      const dayKey = msg.timestamp.toISOString().split('T')[0];
      if (!byDayMap[dayKey]) {
        byDayMap[dayKey] = { date: dayKey, inputTokens: 0, outputTokens: 0, cost: 0 };
      }
      byDayMap[dayKey].inputTokens += inputTokens;
      byDayMap[dayKey].outputTokens += outputTokens;
      byDayMap[dayKey].cost += messageCost;

      // By model
      const modelKey = effectiveModel;
      if (!byModelMap[modelKey]) {
        byModelMap[modelKey] = { model: modelKey, inputTokens: 0, outputTokens: 0, cost: 0, count: 0 };
      }
      byModelMap[modelKey].inputTokens += inputTokens;
      byModelMap[modelKey].outputTokens += outputTokens;
      byModelMap[modelKey].cost += messageCost;
      byModelMap[modelKey].count++;

      // By project
      if (!byProjectMap[msg.projectId]) {
        byProjectMap[msg.projectId] = {
          projectId: msg.projectId,
          projectName: msg.project?.name || 'Unknown',
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          count: 0,
        };
      }
      byProjectMap[msg.projectId].inputTokens += inputTokens;
      byProjectMap[msg.projectId].outputTokens += outputTokens;
      byProjectMap[msg.projectId].cost += messageCost;
      byProjectMap[msg.projectId].count++;
    }

    res.json({
      summary: {
        totalInputTokens,
        totalOutputTokens,
        totalCost,
        totalGenerations,
      },
      byDay: Object.values(byDayMap),
      byModel: Object.values(byModelMap).sort((a, b) => b.cost - a.cost),
      byProject: Object.values(byProjectMap).sort((a, b) => b.cost - a.cost),
    });
  } catch (error: any) {
    console.error('[Analytics] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/analytics/pricing
 * Returns merged pricing table (defaults + user overrides) and raw defaults.
 */
router.get('/pricing', async (req: any, res) => {
  const user = req.user;

  try {
    const userSettings = user.settings ? JSON.parse(user.settings) : {};
    const customPricing: Record<string, ModelPricing> = userSettings.customPricing || {};

    res.json({
      defaults: PRICING_TABLE,
      custom: customPricing,
    });
  } catch (error: any) {
    console.error('[Analytics] Pricing error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch pricing' });
  }
});

export const analyticsRouter = router;
