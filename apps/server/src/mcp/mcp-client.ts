import {
  MCPServerConfig,
  MCPToolDefinition,
  MCPToolResult,
} from './types';

const REQUEST_TIMEOUT = 30000; // 30 seconds
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const PROTOCOL_VERSION = '2025-03-26';

interface CachedTools {
  tools: MCPToolDefinition[];
  timestamp: number;
}

interface MCPCapabilities {
  tools?: { listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  logging?: Record<string, unknown>;
}

interface MCPServerInfo {
  name: string;
  version: string;
}

interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
}

export class MCPClient {
  private config: MCPServerConfig;
  private requestId = 0;
  private toolCache: CachedTools | null = null;
  private sessionId: string | null = null;
  private initialized = false;
  private serverCapabilities: MCPCapabilities | null = null;
  private serverInfo: MCPServerInfo | null = null;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  get serverId(): string {
    return this.config.id;
  }

  get serverName(): string {
    return this.config.name;
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Sanitize server name to create valid tool name prefix
   */
  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Create prefixed tool name: mcp__{serverName}__{toolName}
   */
  private prefixToolName(toolName: string): string {
    const sanitizedServer = this.sanitizeName(this.config.name);
    const sanitizedTool = this.sanitizeName(toolName);
    return `mcp__${sanitizedServer}__${sanitizedTool}`;
  }

  /**
   * Build common headers for MCP requests
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };

    if (this.config.authType === 'bearer' && this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    return headers;
  }

  /**
   * Parse SSE stream into events
   */
  private parseSSE(text: string): SSEEvent[] {
    const events: SSEEvent[] = [];
    const lines = text.split('\n');
    let currentEvent: Partial<SSEEvent> = {};

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (currentEvent.data) {
          currentEvent.data += '\n' + data;
        } else {
          currentEvent.data = data;
        }
      } else if (line.startsWith('id:')) {
        currentEvent.id = line.slice(3).trim();
      } else if (line === '' && currentEvent.data) {
        events.push(currentEvent as SSEEvent);
        currentEvent = {};
      }
    }

    // Handle last event if no trailing newline
    if (currentEvent.data) {
      events.push(currentEvent as SSEEvent);
    }

    return events;
  }

  /**
   * Make a JSON-RPC request using Streamable HTTP transport
   */
  private async streamableHttpRequest<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.config.url) {
      throw new Error('No URL specified for HTTP transport');
    }

    const id = ++this.requestId;

    const request = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params && { params }),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Capture session ID from response headers
      const newSessionId = response.headers.get('Mcp-Session-Id');
      if (newSessionId) {
        this.sessionId = newSessionId;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('Content-Type') || '';

      // Handle SSE stream response
      if (contentType.includes('text/event-stream')) {
        const text = await response.text();
        const events = this.parseSSE(text);

        // Find the response event (should contain our JSON-RPC response)
        for (const event of events) {
          try {
            const parsed = JSON.parse(event.data);
            // Handle batched responses
            if (Array.isArray(parsed)) {
              const ourResponse = parsed.find((r: any) => r.id === id);
              if (ourResponse) {
                if (ourResponse.error) {
                  throw new Error(`MCP Error ${ourResponse.error.code}: ${ourResponse.error.message}`);
                }
                return ourResponse.result as T;
              }
            } else if (parsed.id === id) {
              if (parsed.error) {
                throw new Error(`MCP Error ${parsed.error.code}: ${parsed.error.message}`);
              }
              return parsed.result as T;
            }
          } catch (parseErr) {
            // Skip non-JSON events or events that aren't our response
            continue;
          }
        }
        throw new Error('No matching response found in SSE stream');
      }

      // Handle JSON response
      const jsonResponse = await response.json();

      if (jsonResponse.error) {
        throw new Error(`MCP Error ${jsonResponse.error.code}: ${jsonResponse.error.message}`);
      }

      return jsonResponse.result as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${REQUEST_TIMEOUT}ms`);
        }
        throw error;
      }

      throw new Error('Unknown error occurred');
    }
  }

  /**
   * Send a notification (no response expected)
   */
  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const notification = {
      jsonrpc: '2.0',
      method,
      ...(params && { params }),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(notification),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 202 Accepted is the expected response for notifications
      if (!response.ok && response.status !== 202) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Notification timeout after ${REQUEST_TIMEOUT}ms`);
        }
        throw error;
      }

      throw new Error('Unknown error occurred');
    }
  }

  /**
   * Initialize the MCP connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Send initialize request
    const initResult = await this.streamableHttpRequest<{
      protocolVersion: string;
      capabilities: MCPCapabilities;
      serverInfo: MCPServerInfo;
      instructions?: string;
    }>('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        // Client capabilities - we support receiving tool list changes
      },
      clientInfo: {
        name: 'Adorable',
        version: '1.0.0',
      },
    });

    this.serverCapabilities = initResult.capabilities;
    this.serverInfo = initResult.serverInfo;

    // Send initialized notification
    await this.sendNotification('notifications/initialized');

    this.initialized = true;
  }

  /**
   * Ensure the client is initialized before making requests
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Test connection to the MCP server
   */
  async testConnection(): Promise<{ success: boolean; error?: string; toolCount?: number }> {
    try {
      await this.ensureInitialized();
      const tools = await this.listTools(true); // Force refresh
      return {
        success: true,
        toolCount: tools.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(forceRefresh = false): Promise<MCPToolDefinition[]> {
    await this.ensureInitialized();

    // Check cache
    if (
      !forceRefresh &&
      this.toolCache &&
      Date.now() - this.toolCache.timestamp < CACHE_TTL
    ) {
      return this.toolCache.tools;
    }

    // Check if server supports tools
    if (this.serverCapabilities && !this.serverCapabilities.tools) {
      return [];
    }

    const response = await this.streamableHttpRequest<{
      tools: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }>;
      nextCursor?: string;
    }>('tools/list', {});

    const tools: MCPToolDefinition[] = (response.tools || []).map((tool) => ({
      name: this.prefixToolName(tool.name),
      description: tool.description || `Tool from ${this.config.name}`,
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      serverId: this.config.id,
      originalName: tool.name,
    }));

    // Update cache
    this.toolCache = {
      tools,
      timestamp: Date.now(),
    };

    return tools;
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(
    originalToolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    await this.ensureInitialized();

    const response = await this.streamableHttpRequest<{
      content: Array<{
        type: string;
        text?: string;
        data?: string;
        mimeType?: string;
        resource?: {
          uri: string;
          mimeType?: string;
          text?: string;
        };
      }>;
      isError?: boolean;
    }>('tools/call', {
      name: originalToolName,
      arguments: args,
    });

    // Map response content to our MCPToolResult format
    const content = (response.content || []).map(item => ({
      type: item.type as 'text' | 'image' | 'resource' | 'audio',
      text: item.text,
      data: item.data,
      mimeType: item.mimeType,
    }));

    return {
      content: content.length > 0 ? content : [{ type: 'text' as const, text: 'Tool executed successfully' }],
      isError: response.isError || false,
    };
  }

  /**
   * Clear the tool cache and reset connection state
   */
  clearCache(): void {
    this.toolCache = null;
  }

  /**
   * Reset the client state (for reconnection)
   */
  reset(): void {
    this.toolCache = null;
    this.sessionId = null;
    this.initialized = false;
    this.serverCapabilities = null;
    this.serverInfo = null;
  }
}
