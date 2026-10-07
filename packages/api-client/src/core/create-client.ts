// ============================================================================
// API Client SDK - Client Factory
// ============================================================================

import { HttpClient } from './http-client';
import { TokenManager } from './token-manager';
import type { TokenManagerConfig } from './token-manager';

export interface CreateApiClientConfig {
  /** Base URL for API requests */
  baseUrl: string;
  /** localStorage key for access token (default: 'token') */
  storageKey?: string;
  /** localStorage key for refresh token (default: 'refreshToken') */
  refreshStorageKey?: string;
  /** Endpoint path for token refresh (e.g., '/api/auth/refresh') */
  refreshEndpoint?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Additional headers to send with every request */
  headers?: Record<string, string>;
}

export interface ApiClientInstance {
  client: HttpClient;
  tokenManager: TokenManager;
}

/**
 * Factory that wires TokenManager to HttpClient automatically.
 * When TokenManager tokens change, the HttpClient auth header is updated.
 */
export function createApiClient(config: CreateApiClientConfig): ApiClientInstance {
  const tokenManagerConfig: TokenManagerConfig = {
    storageKey: config.storageKey,
    refreshStorageKey: config.refreshStorageKey,
  };

  const tokenManager = TokenManager.create(tokenManagerConfig);

  const client = new HttpClient({
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    headers: config.headers,
    authToken: tokenManager.getAccessToken() || undefined,
  });

  // Wire token changes to HttpClient
  tokenManager.onTokenChange = (tokens) => {
    if (tokens.accessToken) {
      client.setAuthToken(tokens.accessToken);
    }
  };

  // Wire refresh config if endpoint provided
  if (config.refreshEndpoint) {
    client.setRefreshConfig({
      endpoint: config.refreshEndpoint,
      getRefreshToken: () => tokenManager.getRefreshToken(),
    });

    // When HttpClient refreshes a token, update TokenManager
    client.setOnTokenRefresh((newToken) => {
      const currentRefresh = tokenManager.getRefreshToken();
      tokenManager.setTokens(newToken, currentRefresh || undefined);
    });
  }

  return { client, tokenManager };
}
