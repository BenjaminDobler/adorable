export type MCPAuthType = 'none' | 'bearer';
export type MCPTransport = 'http' | 'stdio';

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransport;
  // HTTP transport
  url?: string;
  authType?: MCPAuthType;
  apiKey?: string; // Encrypted at rest
  // stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // Common
  enabled: boolean;
  lastError?: string;
}

export interface MCPToolDefinition {
  name: string; // Prefixed: mcp__{serverName}__{toolName}
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  originalName: string; // Original tool name from MCP server
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource' | 'audio';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPToolsListResponse {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
}

export interface MCPToolCallResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
