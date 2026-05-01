import type { MCPServerConfig } from '../mcp/types';
import type { ModelPricing } from '../providers/pricing';

/**
 * Server-side view of an AI provider profile as stored in User.settings.profiles.
 * Mirrors the client `AIProfile` (apps/client/src/app/features/profile/profile.types.ts).
 * TODO: hoist the shared shape into libs/shared-types so client and server can't drift.
 */
export interface AIProfile {
  id: string;
  name: string;
  provider: 'anthropic' | 'gemini' | 'figma' | 'claude-code';
  apiKey: string;
  model: string;
  baseUrl?: string;
  builtInTools?: { webSearch?: boolean; urlContext?: boolean };
  sapAiCore?: {
    enabled: boolean;
    authUrl: string;
    clientId: string;
    clientSecret: string;
    resourceGroup: string;
    baseUrl?: string;
  };
}

/**
 * Server-side view of the User.settings JSON column (a stringified UserSettings).
 * Client-only fields like theme are present in the underlying JSON but the
 * server doesn't read them — the index signature catches them.
 */
export interface UserSettings {
  profiles: AIProfile[];
  activeProfileId?: string;
  mcpServers?: MCPServerConfig[];
  angularMcpEnabled?: boolean;
  kitLessonsEnabled?: boolean;
  researchAgentEnabled?: boolean;
  reviewAgentEnabled?: boolean;
  customPricing?: Record<string, ModelPricing>;
  model?: string;
  /** Legacy: kits inlined in settings before the dedicated Kit table — read only by migrations. */
  kits?: unknown[];
  [key: string]: unknown;
}

/**
 * Parse the User.settings JSON column. Returns defaults for null/invalid input;
 * never throws. Always guarantees `profiles` is an array so callers can read
 * `settings.profiles` directly.
 *
 * Accepts already-parsed objects too — a few legacy code paths (kit migration)
 * forwarded settings as either string or object.
 */
export function parseUserSettings(
  raw: string | null | undefined | Record<string, unknown>,
): UserSettings {
  if (raw == null) return { profiles: [] };

  let parsed: unknown;
  if (typeof raw === 'string') {
    if (!raw.trim()) return { profiles: [] };
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn('[UserSettings] Failed to parse settings JSON:', (err as Error).message);
      return { profiles: [] };
    }
  } else {
    parsed = raw;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { profiles: [] };
  }

  const settings = parsed as UserSettings;
  if (!Array.isArray(settings.profiles)) settings.profiles = [];
  return settings;
}
