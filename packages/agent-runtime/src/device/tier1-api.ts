import { z } from 'zod';

export const ApiDefinitionSchema = z.object({
  endpoint: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  description: z.string(),
  params: z.record(z.string(), z.string()).optional(),
});

export type ApiDefinition = z.infer<typeof ApiDefinitionSchema>;

export interface ApiCallResult {
  success: boolean;
  data: unknown;
  timestamp: number;
  endpoint: string;
  latencyMs: number;
}

/**
 * Real API execution backend. When configured, registered API calls are issued
 * against a real gateway instead of being simulated in-process. Throwing falls
 * back to the simulated result.
 */
export interface ApiExecutionBackend {
  execute(
    api: ApiDefinition,
    params: Record<string, unknown> | undefined,
  ): Promise<{ success: boolean; data: unknown }>;
}

/**
 * Real API execution backend that issues HTTP requests against a configured
 * gateway base URL. Enabled by TIER1_API_BASE_URL (optionally TIER1_API_KEY).
 */
export class HttpApiExecutionBackend implements ApiExecutionBackend {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async execute(
    api: ApiDefinition,
    params: Record<string, unknown> | undefined,
  ): Promise<{ success: boolean; data: unknown }> {
    const base = this.baseUrl.replace(/\/$/, '');
    const path = api.endpoint.startsWith('/') ? api.endpoint : `/${api.endpoint}`;
    let url = `${base}${path}`;
    const init: { method: string; headers: Record<string, string>; body?: string } = {
      method: api.method,
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
    };
    if (params && (api.method === 'GET' || api.method === 'DELETE')) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        qs.append(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
      const query = qs.toString();
      if (query) url += `?${query}`;
    } else if (params) {
      init.body = JSON.stringify(params);
    }

    const res = await fetch(url, init);
    const data: unknown = await res.json().catch(() => ({}));
    return { success: res.ok, data };
  }
}

export class Tier1ApiController {
  private readonly apis: Map<string, ApiDefinition> = new Map();
  private readonly backend: ApiExecutionBackend | null;

  constructor(apis?: ApiDefinition[], backend?: ApiExecutionBackend | null) {
    if (apis) {
      for (const api of apis) {
        this.apis.set(api.endpoint, api);
      }
    }
    this.backend = backend ?? Tier1ApiController.createBackendFromEnv();
  }

  private static createBackendFromEnv(): ApiExecutionBackend | null {
    const url = process.env['TIER1_API_BASE_URL'];
    if (url) {
      return new HttpApiExecutionBackend(url, process.env['TIER1_API_KEY']);
    }
    return null;
  }

  /** Whether a real API execution backend is wired up. */
  isBackendConfigured(): boolean {
    return this.backend !== null;
  }

  registerApi(definition: ApiDefinition): void {
    const parsed = ApiDefinitionSchema.parse(definition);
    this.apis.set(parsed.endpoint, parsed);
  }

  getAvailableApis(): ApiDefinition[] {
    return [...this.apis.values()];
  }

  async callApi(endpoint: string, params?: Record<string, unknown>): Promise<ApiCallResult> {
    const api = this.apis.get(endpoint);
    if (!api) {
      return {
        success: false,
        data: { error: `API endpoint not found: ${endpoint}` },
        timestamp: Date.now(),
        endpoint,
        latencyMs: 0,
      };
    }

    const start = Date.now();

    if (this.backend) {
      try {
        const { success, data } = await this.backend.execute(api, params);
        return { success, data, timestamp: Date.now(), endpoint, latencyMs: Date.now() - start };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(
          `[tier1-api] backend execution failed for ${endpoint}, using simulated result: ${message}`,
        );
      }
    }

    // Simulated internal API call (used when no real gateway is configured).
    return {
      success: true,
      data: { endpoint, params, method: api.method },
      timestamp: Date.now(),
      endpoint,
      latencyMs: Date.now() - start,
    };
  }

  hasApi(endpoint: string): boolean {
    return this.apis.has(endpoint);
  }

  removeApi(endpoint: string): boolean {
    return this.apis.delete(endpoint);
  }
}
