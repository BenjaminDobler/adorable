import { SapAiCoreConfig } from './types';

// SDK model name → SAP AI Core model name
const MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-5-20250929': 'anthropic--claude-4.6-sonnet',
  'claude-opus-4-6': 'anthropic--claude-4.6-opus',
  'claude-haiku-4-5-20251001': 'anthropic--claude-4.5-haiku',
  'claude-opus-4-20250514': 'anthropic--claude-4-opus',
  'claude-sonnet-4-20250514': 'anthropic--claude-4-sonnet',
  'claude-3-7-sonnet-20250219': 'anthropic--claude-3.7-sonnet',
  'claude-3-5-sonnet-20241022': 'anthropic--claude-3.5-sonnet',
  'claude-3-haiku-20240307': 'anthropic--claude-3-haiku',
};

// Reverse map: SAP model name → SDK model name
const REVERSE_MODEL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_MAP).map(([k, v]) => [v, k])
);

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Manages OAuth 2.0 tokens for SAP AI Core.
 * Caches tokens per clientId with a 60-second safety buffer before expiry.
 */
class SapTokenManager {
  private static instance: SapTokenManager;
  private cache = new Map<string, CachedToken>();

  static getInstance(): SapTokenManager {
    if (!SapTokenManager.instance) {
      SapTokenManager.instance = new SapTokenManager();
    }
    return SapTokenManager.instance;
  }

  async getToken(authUrl: string, clientId: string, clientSecret: string): Promise<string> {
    const cached = this.cache.get(clientId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    const url = `${authUrl}/oauth/token`;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SAP OAuth token request failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    const expiresIn = data.expires_in || 3600;

    this.cache.set(clientId, {
      token: data.access_token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    });

    console.log(`[SAP AI Core] OAuth token obtained for client ${clientId.substring(0, 8)}... (expires in ${expiresIn}s)`);
    return data.access_token;
  }
}

interface CachedDeployment {
  deploymentId: string;
  expiresAt: number;
}

/**
 * Resolves SAP AI Core deployment IDs for model names.
 * Caches deployment lookups for 5 minutes.
 */
class SapDeploymentResolver {
  private static instance: SapDeploymentResolver;
  private cache = new Map<string, CachedDeployment>();

  static getInstance(): SapDeploymentResolver {
    if (!SapDeploymentResolver.instance) {
      SapDeploymentResolver.instance = new SapDeploymentResolver();
    }
    return SapDeploymentResolver.instance;
  }

  async getDeploymentId(config: SapAiCoreConfig, sdkModelName: string): Promise<string> {
    const cacheKey = `${config.clientId}:${sdkModelName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.deploymentId;
    }

    const sapModelName = MODEL_MAP[sdkModelName];
    if (!sapModelName) {
      throw new Error(`No SAP AI Core model mapping for "${sdkModelName}". Known models: ${Object.keys(MODEL_MAP).join(', ')}`);
    }

    const token = await SapTokenManager.getInstance().getToken(
      config.authUrl, config.clientId, config.clientSecret
    );

    const url = `${config.baseUrl}/v2/lm/deployments`;
    const response = await globalThis.fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'AI-Resource-Group': config.resourceGroup,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SAP deployment list failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    const deployments = data.resources || data.deployments || [];

    const match = deployments.find((d: any) =>
      d.status === 'RUNNING' &&
      (d.model?.name === sapModelName ||
       d.details?.resources?.backendDetails?.model?.name === sapModelName ||
       d.model?.name?.includes(sapModelName))
    );

    if (!match) {
      const available = deployments
        .filter((d: any) => d.status === 'RUNNING')
        .map((d: any) => d.model?.name || d.details?.resources?.backendDetails?.model?.name || 'unknown')
        .join(', ');
      throw new Error(`No running SAP deployment found for model "${sapModelName}". Available: ${available || 'none'}`);
    }

    const deploymentId = match.id;
    this.cache.set(cacheKey, {
      deploymentId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    console.log(`[SAP AI Core] Resolved ${sdkModelName} → deployment ${deploymentId}`);
    return deploymentId;
  }
}

interface CachedCsrf {
  token: string;
  cookies: string;
  expiresAt: number;
}

/**
 * Manages CSRF tokens for SAP AI Core API endpoints.
 * SAP BTP enforces CSRF on POST requests. Tokens are fetched via GET
 * with `X-Csrf-Token: Fetch` and cached for 10 minutes.
 */
class SapCsrfManager {
  private static instance: SapCsrfManager;
  private cache = new Map<string, CachedCsrf>();

  static getInstance(): SapCsrfManager {
    if (!SapCsrfManager.instance) {
      SapCsrfManager.instance = new SapCsrfManager();
    }
    return SapCsrfManager.instance;
  }

  async getToken(baseUrl: string, bearerToken: string, resourceGroup: string): Promise<{ csrfToken: string; cookies: string }> {
    const cacheKey = `${baseUrl}:${resourceGroup}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { csrfToken: cached.token, cookies: cached.cookies };
    }

    // Fetch CSRF token from the deployments endpoint (any GET on the same service works)
    const csrfUrl = `${baseUrl}/v2/lm/deployments?$top=1`;
    const response = await globalThis.fetch(csrfUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'AI-Resource-Group': resourceGroup,
        'X-Csrf-Token': 'Fetch',
      },
    });

    const csrfToken = response.headers.get('x-csrf-token') || '';

    // Extract cookies robustly — try getSetCookie() first, fall back to raw header
    let cookies = '';
    if (typeof response.headers.getSetCookie === 'function') {
      const setCookies = response.headers.getSetCookie();
      cookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
    }
    if (!cookies) {
      // Fallback: parse raw set-cookie header (some Node versions join them)
      const raw = response.headers.get('set-cookie');
      if (raw) {
        cookies = raw.split(/,(?=\s*\w+=)/).map((c: string) => c.split(';')[0].trim()).join('; ');
      }
    }

    if (csrfToken) {
      this.cache.set(cacheKey, {
        token: csrfToken,
        cookies,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      });
    }

    return { csrfToken, cookies };
  }

  invalidate(baseUrl: string, resourceGroup: string) {
    this.cache.delete(`${baseUrl}:${resourceGroup}`);
  }
}

/**
 * Strip cache_control from system/message content blocks (unsupported by Bedrock).
 */
function stripCacheControl(body: any): void {
  if (Array.isArray(body.system)) {
    for (const block of body.system) {
      delete block.cache_control;
    }
  }
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          delete block.cache_control;
        }
      }
    }
  }
}

/**
 * Strip web_search tool from tools array (Anthropic-specific server-side tool,
 * unavailable through Bedrock).
 */
function stripWebSearchTool(body: any): void {
  if (Array.isArray(body.tools)) {
    body.tools = body.tools.filter((t: any) => t.type !== 'web_search_20250305');
  }
}

/**
 * Transform SAP/Bedrock SSE stream to add `event:` lines the Anthropic SDK expects.
 *
 * SAP sends: `data: {"type":"message_start",...}\n\n`
 * SDK needs: `event: message_start\ndata: {"type":"message_start",...}\n\n`
 */
function transformSapStream(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = input.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Flush remaining buffer
            if (buffer.trim()) {
              const transformed = processLine(buffer);
              controller.enqueue(encoder.encode(transformed));
            }
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last (potentially incomplete) line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const transformed = processLine(line);
            controller.enqueue(encoder.encode(transformed + '\n'));
          }
        }
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

function processLine(line: string): string {
  if (line.startsWith('data: ')) {
    const jsonStr = line.substring(6);
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.type) {
        // Inject the event line before the data line
        return `event: ${parsed.type}\n${line}`;
      }
    } catch {
      // Not valid JSON, pass through
    }
  }
  return line;
}

/**
 * Creates a custom `fetch` function for the Anthropic SDK that transparently
 * routes requests through SAP AI Core with OAuth auth, URL rewriting,
 * Bedrock body format, and SSE stream repair.
 */
export function createSapFetch(
  config: SapAiCoreConfig,
  sdkModelName: string
): typeof globalThis.fetch {
  const tokenManager = SapTokenManager.getInstance();
  const deploymentResolver = SapDeploymentResolver.getInstance();
  const csrfManager = SapCsrfManager.getInstance();

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    // Only intercept POST requests to the messages endpoint
    if (request.method !== 'POST' || !request.url.includes('/messages')) {
      return globalThis.fetch(input, init);
    }

    // 1. Get OAuth token
    const token = await tokenManager.getToken(config.authUrl, config.clientId, config.clientSecret);

    // 2. Resolve deployment ID
    const deploymentId = await deploymentResolver.getDeploymentId(config, sdkModelName);

    // 3. Parse and transform the body
    const body = await request.json();
    const isStreaming = body.stream === true;

    // Remove fields Bedrock doesn't accept
    delete body.model;
    delete body.stream;

    // Add Bedrock version
    body.anthropic_version = 'bedrock-2023-05-31';

    // Strip unsupported features
    stripCacheControl(body);
    stripWebSearchTool(body);

    // 4. Build SAP URL
    const endpoint = isStreaming ? 'invoke-with-response-stream' : 'invoke';
    const sapUrl = `${config.baseUrl}/v2/inference/deployments/${deploymentId}/${endpoint}`;

    // 5. Get CSRF token (SAP BTP enforces CSRF on POST requests)
    const { csrfToken, cookies } = await csrfManager.getToken(config.baseUrl, token, config.resourceGroup);

    // 6. Make the real request
    console.log(`[SAP AI Core] ${isStreaming ? 'Streaming' : 'Non-streaming'} request to deployment ${deploymentId}`);

    const bodyJson = JSON.stringify(body);

    let response = await globalThis.fetch(sapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'AI-Resource-Group': config.resourceGroup,
        ...(csrfToken && { 'X-Csrf-Token': csrfToken }),
        ...(cookies && { 'Cookie': cookies }),
      },
      body: bodyJson,
    });

    // Retry once if CSRF token was stale
    if (response.status === 403) {
      const errorText = await response.text();
      if (errorText.toLowerCase().includes('csrf')) {
        console.log('[SAP AI Core] CSRF token rejected, fetching fresh token and retrying...');
        csrfManager.invalidate(config.baseUrl, config.resourceGroup);
        const fresh = await csrfManager.getToken(config.baseUrl, token, config.resourceGroup);
        response = await globalThis.fetch(sapUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'AI-Resource-Group': config.resourceGroup,
            ...(fresh.csrfToken && { 'X-Csrf-Token': fresh.csrfToken }),
            ...(fresh.cookies && { 'Cookie': fresh.cookies }),
          },
          body: bodyJson,
        });
      } else {
        // Non-CSRF 403 — reconstruct a Response with the body we already consumed
        return new Response(errorText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
    }

    if (!response.ok) {
      // Pass error through as-is so the SDK can handle it
      return response;
    }

    // 6. If streaming, transform the SSE stream
    if (isStreaming && response.body) {
      const transformedBody = transformSapStream(response.body);
      return new Response(transformedBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    return response;
  };
}

/**
 * Fetch available models from SAP AI Core deployments.
 * Returns SDK-compatible model names.
 */
export async function getAvailableModels(config: SapAiCoreConfig): Promise<string[]> {
  const token = await SapTokenManager.getInstance().getToken(
    config.authUrl, config.clientId, config.clientSecret
  );

  const url = `${config.baseUrl}/v2/lm/deployments`;
  const response = await globalThis.fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'AI-Resource-Group': config.resourceGroup,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SAP deployment list failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const deployments = data.resources || data.deployments || [];

  const models: string[] = [];
  for (const d of deployments) {
    if (d.status !== 'RUNNING') continue;
    const sapName = d.model?.name || d.details?.resources?.backendDetails?.model?.name;
    if (sapName && REVERSE_MODEL_MAP[sapName]) {
      models.push(REVERSE_MODEL_MAP[sapName]);
    }
  }

  return models.sort();
}
