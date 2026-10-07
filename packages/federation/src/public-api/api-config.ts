import { z } from 'zod';

export const APIEndpointConfigSchema = z.object({
  path: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  handler: z.string(),
  auth: z.enum(['none', 'api-key', 'oauth2', 'bearer']),
  rateLimit: z
    .object({
      requests: z.number(),
      windowMs: z.number(),
    })
    .optional(),
  description: z.string().optional(),
});

export type APIEndpointConfig = z.infer<typeof APIEndpointConfigSchema>;

export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, { summary?: string; security?: unknown[] }>>;
}

export interface APIStatus {
  totalEndpoints: number;
  byMethod: Record<string, number>;
  byAuth: Record<string, number>;
}

export class PublicAPIConfig {
  private endpoints: Map<string, APIEndpointConfig> = new Map();

  getEndpoints(): APIEndpointConfig[] {
    return [...this.endpoints.values()];
  }

  registerEndpoint(
    path: string,
    method: APIEndpointConfig['method'],
    handler: string,
    auth: APIEndpointConfig['auth'],
  ): APIEndpointConfig {
    const config: APIEndpointConfig = { path, method, handler, auth };
    const key = `${method}:${path}`;
    this.endpoints.set(key, config);
    return config;
  }

  generateOpenAPISpec(): OpenAPISpec {
    const paths: OpenAPISpec['paths'] = {};

    for (const endpoint of this.endpoints.values()) {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {};
      }

      const security: unknown[] = [];
      if (endpoint.auth === 'api-key') {
        security.push({ ApiKeyAuth: [] });
      } else if (endpoint.auth === 'oauth2') {
        security.push({ OAuth2: [] });
      } else if (endpoint.auth === 'bearer') {
        security.push({ BearerAuth: [] });
      }

      paths[endpoint.path]![endpoint.method.toLowerCase()] = {
        summary: endpoint.description ?? `${endpoint.method} ${endpoint.path}`,
        security: security.length > 0 ? security : undefined,
      };
    }

    return {
      openapi: '3.0.3',
      info: {
        title: 'Quant Public API',
        version: '1.0.0',
        description: 'Public API for Quant self-hosted instances',
      },
      paths,
    };
  }

  setRateLimit(endpoint: string, limits: { requests: number; windowMs: number }): boolean {
    // endpoint format is "METHOD:/path"
    const config = this.endpoints.get(endpoint);
    if (!config) return false;

    config.rateLimit = limits;
    return true;
  }

  getAPIStatus(): APIStatus {
    const byMethod: Record<string, number> = {};
    const byAuth: Record<string, number> = {};

    for (const endpoint of this.endpoints.values()) {
      byMethod[endpoint.method] = (byMethod[endpoint.method] ?? 0) + 1;
      byAuth[endpoint.auth] = (byAuth[endpoint.auth] ?? 0) + 1;
    }

    return {
      totalEndpoints: this.endpoints.size,
      byMethod,
      byAuth,
    };
  }
}
