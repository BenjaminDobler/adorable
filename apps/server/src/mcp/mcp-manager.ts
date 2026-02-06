import { MCPClient } from './mcp-client';
import { MCPStdioClient } from './mcp-stdio-client';
import { MCPServerConfig, MCPToolDefinition, MCPToolResult } from './types';

// Common interface for both client types
interface IMCPClient {
  serverId: string;
  serverName: string;
  isEnabled: boolean;
  initialize(): Promise<void>;
  listTools(forceRefresh?: boolean): Promise<MCPToolDefinition[]>;
  callTool(originalToolName: string, args: Record<string, unknown>): Promise<MCPToolResult>;
  clearCache(): void;
  reset(): void;
}

export class MCPManager {
  private clients: Map<string, IMCPClient> = new Map();
  private toolToServer: Map<string, { client: IMCPClient; originalName: string }> = new Map();
  private initErrors: Map<string, string> = new Map();

  /**
   * Create the appropriate client based on transport type
   */
  private createClient(config: MCPServerConfig): IMCPClient {
    // Default to 'http' for backwards compatibility
    const transport = config.transport || 'http';

    if (transport === 'stdio') {
      return new MCPStdioClient(config);
    } else {
      return new MCPClient(config);
    }
  }

  /**
   * Initialize MCP clients for enabled servers
   */
  async initialize(configs: MCPServerConfig[]): Promise<void> {
    // Dispose existing clients first
    for (const client of this.clients.values()) {
      if ('dispose' in client && typeof client.dispose === 'function') {
        (client as MCPStdioClient).dispose();
      }
    }

    this.clients.clear();
    this.toolToServer.clear();
    this.initErrors.clear();

    const enabledConfigs = configs.filter((c) => c.enabled);

    // Initialize servers in parallel for better performance
    const initPromises = enabledConfigs.map(async (config) => {
      const client = this.createClient(config);
      this.clients.set(config.id, client);

      try {
        // Initialize the connection (performs MCP handshake)
        await client.initialize();

        // Discover tools and build mapping
        const tools = await client.listTools();
        for (const tool of tools) {
          this.toolToServer.set(tool.name, {
            client,
            originalName: tool.originalName,
          });
        }

        const transport = config.transport || 'http';
        console.log(`[MCP] Connected to "${config.name}" (${transport}) - ${tools.length} tool(s) available`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.initErrors.set(config.id, errorMsg);
        console.error(`[MCP] Failed to initialize server "${config.name}": ${errorMsg}`);
      }
    });

    await Promise.allSettled(initPromises);
  }

  /**
   * Get all available tools from all connected MCP servers
   */
  async getAllTools(): Promise<MCPToolDefinition[]> {
    const allTools: MCPToolDefinition[] = [];

    for (const client of this.clients.values()) {
      if (!client.isEnabled) continue;

      try {
        const tools = await client.listTools();
        allTools.push(...tools);
      } catch (error) {
        console.error(
          `Failed to get tools from MCP server "${client.serverName}":`,
          error instanceof Error ? error.message : error
        );
      }
    }

    return allTools;
  }

  /**
   * Call a tool by its prefixed name
   */
  async callTool(
    prefixedName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    const mapping = this.toolToServer.get(prefixedName);

    if (!mapping) {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown MCP tool: ${prefixedName}`,
          },
        ],
        isError: true,
      };
    }

    try {
      return await mapping.client.callTool(mapping.originalName, args);
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling MCP tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Check if a tool name is an MCP tool
   */
  isMCPTool(toolName: string): boolean {
    return toolName.startsWith('mcp__');
  }

  /**
   * Get the number of connected servers
   */
  get serverCount(): number {
    return this.clients.size;
  }

  /**
   * Get the total number of available tools
   */
  get toolCount(): number {
    return this.toolToServer.size;
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    for (const client of this.clients.values()) {
      client.clearCache();
    }
  }

  /**
   * Get initialization errors for debugging
   */
  getInitErrors(): Map<string, string> {
    return new Map(this.initErrors);
  }

  /**
   * Reset all clients (for reconnection)
   */
  resetAll(): void {
    for (const client of this.clients.values()) {
      client.reset();
    }
    this.toolToServer.clear();
    this.initErrors.clear();
  }
}
