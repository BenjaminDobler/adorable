import { spawn, ChildProcess } from 'child_process';
import { MCPServerConfig, MCPToolDefinition, MCPToolResult } from './types';

const REQUEST_TIMEOUT = 30000;
const CACHE_TTL = 5 * 60 * 1000;
const PROTOCOL_VERSION = '2025-03-26';

interface CachedTools {
  tools: MCPToolDefinition[];
  timestamp: number;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class MCPStdioClient {
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private toolCache: CachedTools | null = null;
  private initialized = false;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private buffer = '';

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

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private prefixToolName(toolName: string): string {
    const sanitizedServer = this.sanitizeName(this.config.name);
    const sanitizedTool = this.sanitizeName(toolName);
    return `mcp__${sanitizedServer}__${sanitizedTool}`;
  }

  private async spawnProcess(): Promise<void> {
    if (this.process) {
      return;
    }

    if (!this.config.command) {
      throw new Error('No command specified for stdio transport');
    }

    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...(this.config.env || {})
      };

      this.process = spawn(this.config.command!, this.config.args || [], {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.on('error', (err) => {
        console.error(`[MCP stdio] Process error for "${this.config.name}":`, err);
        this.cleanup();
        reject(err);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[MCP stdio] Process exited for "${this.config.name}": code=${code}, signal=${signal}`);
        this.cleanup();
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[MCP stdio] stderr from "${this.config.name}":`, data.toString());
      });

      this.process.stdout?.on('data', (data) => {
        this.handleStdoutData(data.toString());
      });

      // Give the process a moment to start
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          resolve();
        } else {
          reject(new Error('Process failed to start'));
        }
      }, 100);
    });
  }

  private handleStdoutData(data: string): void {
    this.buffer += data;

    // Process complete JSON-RPC messages (newline-delimited)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);

        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
          const pending = this.pendingRequests.get(message.id)!;
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.id);

          if (message.error) {
            pending.reject(new Error(`MCP Error ${message.error.code}: ${message.error.message}`));
          } else {
            pending.resolve(message.result);
          }
        }
      } catch (e) {
        // Not valid JSON, might be partial or debug output
      }
    }
  }

  private async sendRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.process || this.process.killed) {
      await this.spawnProcess();
    }

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params && { params })
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${REQUEST_TIMEOUT}ms`));
      }, REQUEST_TIMEOUT);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const message = JSON.stringify(request) + '\n';
      this.process!.stdin?.write(message, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.process || this.process.killed) {
      await this.spawnProcess();
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      ...(params && { params })
    };

    const message = JSON.stringify(notification) + '\n';
    this.process!.stdin?.write(message);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.spawnProcess();

    const initResult = await this.sendRequest<{
      protocolVersion: string;
      capabilities: any;
      serverInfo: any;
    }>('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'Adorable',
        version: '1.0.0'
      }
    });

    await this.sendNotification('notifications/initialized');
    this.initialized = true;

    console.log(`[MCP stdio] Initialized "${this.config.name}":`, initResult.serverInfo?.name);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string; toolCount?: number }> {
    try {
      await this.ensureInitialized();
      const tools = await this.listTools(true);
      return {
        success: true,
        toolCount: tools.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async listTools(forceRefresh = false): Promise<MCPToolDefinition[]> {
    await this.ensureInitialized();

    if (
      !forceRefresh &&
      this.toolCache &&
      Date.now() - this.toolCache.timestamp < CACHE_TTL
    ) {
      return this.toolCache.tools;
    }

    const response = await this.sendRequest<{
      tools: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }>;
    }>('tools/list', {});

    const tools: MCPToolDefinition[] = (response.tools || []).map((tool) => ({
      name: this.prefixToolName(tool.name),
      description: tool.description || `Tool from ${this.config.name}`,
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      serverId: this.config.id,
      originalName: tool.name
    }));

    this.toolCache = {
      tools,
      timestamp: Date.now()
    };

    return tools;
  }

  async callTool(
    originalToolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    await this.ensureInitialized();

    const response = await this.sendRequest<{
      content: Array<{
        type: string;
        text?: string;
        data?: string;
        mimeType?: string;
      }>;
      isError?: boolean;
    }>('tools/call', {
      name: originalToolName,
      arguments: args
    });

    const content = (response.content || []).map(item => ({
      type: item.type as 'text' | 'image' | 'resource' | 'audio',
      text: item.text,
      data: item.data,
      mimeType: item.mimeType
    }));

    return {
      content: content.length > 0 ? content : [{ type: 'text' as const, text: 'Tool executed successfully' }],
      isError: response.isError || false
    };
  }

  clearCache(): void {
    this.toolCache = null;
  }

  private cleanup(): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Process terminated'));
    }
    this.pendingRequests.clear();

    this.process = null;
    this.initialized = false;
    this.buffer = '';
  }

  reset(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.cleanup();
    this.toolCache = null;
  }

  dispose(): void {
    this.reset();
  }
}
