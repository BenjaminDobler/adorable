import { ThemeCombined, ThemeSettings } from '../../core/services/theme';

export type ProviderType = 'anthropic' | 'gemini' | 'figma' | 'claude-code';
export type MCPAuthType = 'none' | 'bearer';
export type MCPTransport = 'http' | 'stdio';

export interface BuiltInToolConfig {
  webSearch?: boolean;
  urlContext?: boolean;
}

export interface SapAiCoreConfig {
  enabled: boolean;
  authUrl: string;
  clientId: string;
  clientSecret: string;
  resourceGroup: string;
}

export interface AIProfile {
  id: string;
  name: string;
  provider: ProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
  builtInTools?: BuiltInToolConfig;
  sapAiCore?: SapAiCoreConfig;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransport;
  url?: string;
  authType?: MCPAuthType;
  apiKey?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  lastError?: string;
}

export interface AppSettings {
  profiles: AIProfile[];
  activeProfileId: string;
  theme?: ThemeCombined;
  themeSettings?: ThemeSettings;
  mcpServers?: MCPServerConfig[];
  angularMcpEnabled?: boolean;
  kitLessonsEnabled?: boolean;
  researchAgentEnabled?: boolean;
  reviewAgentEnabled?: boolean;
}
