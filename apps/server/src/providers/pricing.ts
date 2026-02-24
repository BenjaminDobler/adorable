import { TokenUsage } from './types';

export interface ModelPricing {
  inputCostPer1M: number;
  outputCostPer1M: number;
  cacheCreationCostPer1M?: number;
  cacheReadCostPer1M?: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheCreationCost: number;
  cacheReadCost: number;
  totalCost: number;
}

// Pricing table keyed by model name prefix (matched against model ID)
// Prices are per 1M tokens in USD
// Sources:
//   Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
//   Google:    https://ai.google.dev/gemini-api/docs/pricing
export const PRICING_TABLE: Record<string, ModelPricing> = {
  // --- Anthropic Claude ---
  // Opus 4.5 / 4.6 ($5 in, $25 out)
  'claude-opus-4-5': {
    inputCostPer1M: 5,
    outputCostPer1M: 25,
    cacheCreationCostPer1M: 6.25,
    cacheReadCostPer1M: 0.50,
  },
  'claude-opus-4-6': {
    inputCostPer1M: 5,
    outputCostPer1M: 25,
    cacheCreationCostPer1M: 6.25,
    cacheReadCostPer1M: 0.50,
  },
  // Opus 4 / 4.1 ($15 in, $75 out)
  'claude-opus-4-1': {
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    cacheCreationCostPer1M: 18.75,
    cacheReadCostPer1M: 1.50,
  },
  'claude-opus-4': {
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    cacheCreationCostPer1M: 18.75,
    cacheReadCostPer1M: 1.50,
  },
  // Sonnet 4 / 4.5 / 4.6 ($3 in, $15 out)
  'claude-sonnet-4': {
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    cacheCreationCostPer1M: 3.75,
    cacheReadCostPer1M: 0.30,
  },
  // Haiku 4.5 ($1 in, $5 out)
  'claude-haiku-4-5': {
    inputCostPer1M: 1,
    outputCostPer1M: 5,
    cacheCreationCostPer1M: 1.25,
    cacheReadCostPer1M: 0.10,
  },
  // Haiku 3.5 ($0.80 in, $4 out)
  'claude-haiku-3-5': {
    inputCostPer1M: 0.80,
    outputCostPer1M: 4,
    cacheCreationCostPer1M: 1,
    cacheReadCostPer1M: 0.08,
  },
  'claude-3-5-haiku': {
    inputCostPer1M: 0.80,
    outputCostPer1M: 4,
    cacheCreationCostPer1M: 1,
    cacheReadCostPer1M: 0.08,
  },
  // Sonnet 3.7 / 3.5 ($3 in, $15 out)
  'claude-3-7-sonnet': {
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    cacheCreationCostPer1M: 3.75,
    cacheReadCostPer1M: 0.30,
  },
  'claude-3-5-sonnet': {
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    cacheCreationCostPer1M: 3.75,
    cacheReadCostPer1M: 0.30,
  },
  // Opus 3 ($15 in, $75 out)
  'claude-3-opus': {
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    cacheCreationCostPer1M: 18.75,
    cacheReadCostPer1M: 1.50,
  },
  // Haiku 3 ($0.25 in, $1.25 out)
  'claude-3-haiku': {
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
    cacheCreationCostPer1M: 0.30,
    cacheReadCostPer1M: 0.03,
  },

  // --- Google Gemini ---
  // Gemini 3.1 Pro / 3 Pro ($2 in, $12 out)
  'gemini-3': {
    inputCostPer1M: 2,
    outputCostPer1M: 12,
  },
  // Gemini 3 Flash ($0.50 in, $3 out)
  'gemini-3-flash': {
    inputCostPer1M: 0.50,
    outputCostPer1M: 3,
  },
  // Gemini 2.5 Pro ($1.25 in, $10 out)
  'gemini-2.5-pro': {
    inputCostPer1M: 1.25,
    outputCostPer1M: 10,
  },
  // Gemini 2.5 Flash ($0.30 in, $2.50 out)
  'gemini-2.5-flash': {
    inputCostPer1M: 0.30,
    outputCostPer1M: 2.50,
  },
  // Gemini 2.5 Flash-Lite ($0.10 in, $0.40 out)
  'gemini-2.5-flash-lite': {
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
  },
  // Gemini 2.0 Flash ($0.10 in, $0.40 out)
  'gemini-2.0-flash': {
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
  },
  // Gemini 2.0 Flash-Lite ($0.075 in, $0.30 out)
  'gemini-2.0-flash-lite': {
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
  },
  // Gemini 1.5 Pro ($1.25 in, $5 out)
  'gemini-1.5-pro': {
    inputCostPer1M: 1.25,
    outputCostPer1M: 5,
  },
  // Gemini 1.5 Flash ($0.075 in, $0.30 out)
  'gemini-1.5-flash': {
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
  },
};

// Regex fallback for model names that don't match any prefix exactly.
// Checked in order — first match wins. Maps to the closest pricing tier.
const FAMILY_FALLBACKS: [RegExp, string][] = [
  // Claude — match specific tiers first, then broad families
  [/claude.*opus.*4\.[5-9]/i, 'claude-opus-4-5'],
  [/claude.*opus.*4/i, 'claude-opus-4'],
  [/claude.*opus/i, 'claude-3-opus'],
  [/claude.*sonnet/i, 'claude-sonnet-4'],
  [/claude.*haiku.*4/i, 'claude-haiku-4-5'],
  [/claude.*haiku.*3\.5/i, 'claude-3-5-haiku'],
  [/claude.*haiku/i, 'claude-3-haiku'],
  // Gemini — match flash before pro (flash-lite before flash)
  [/gemini.*flash.*lite/i, 'gemini-2.5-flash-lite'],
  [/gemini.*flash/i, 'gemini-2.5-flash'],
  [/gemini.*pro/i, 'gemini-3'],
];

export function findPricing(model: string, customPricing?: Record<string, ModelPricing>): ModelPricing | null {
  // Check custom pricing first (exact match only)
  if (customPricing && customPricing[model]) {
    return customPricing[model];
  }

  // Try exact prefix match (longest prefix first)
  const prefixes = Object.keys(PRICING_TABLE).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (model.startsWith(prefix)) {
      return PRICING_TABLE[prefix];
    }
  }

  // Fallback: regex-based family matching
  for (const [pattern, key] of FAMILY_FALLBACKS) {
    if (pattern.test(model) && PRICING_TABLE[key]) {
      return PRICING_TABLE[key];
    }
  }

  return null;
}

export function calculateCost(usage: TokenUsage, model: string, customPricing?: Record<string, ModelPricing>): CostBreakdown {
  const pricing = findPricing(model, customPricing);
  if (!pricing) {
    console.warn(`[Pricing] No pricing found for model: "${model}"`);
    return { inputCost: 0, outputCost: 0, cacheCreationCost: 0, cacheReadCost: 0, totalCost: 0 };
  }

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputCostPer1M;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputCostPer1M;
  const cacheCreationCost = (usage.cacheCreationInputTokens || 0) / 1_000_000 * (pricing.cacheCreationCostPer1M || 0);
  const cacheReadCost = (usage.cacheReadInputTokens || 0) / 1_000_000 * (pricing.cacheReadCostPer1M || 0);
  const totalCost = inputCost + outputCost + cacheCreationCost + cacheReadCost;

  return { inputCost, outputCost, cacheCreationCost, cacheReadCost, totalCost };
}
