// ============================================================================
// API Client SDK - HTTP Client
// ============================================================================

import type { APIResponse, APIError, RequestConfig, RefreshConfig } from './types';

/**
 * Type-safe HTTP client with auth token injection, automatic token refresh,
 * error parsing, and configurable base URL.
 */
export class HttpClient {
  private config: RequestConfig;
  private refreshConfig: RefreshConfig | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private onTokenRefresh?: (newToken: string) => void;
  private onAuthError?: (error: APIError) => void;

  constructor(config: RequestConfig) {
    this.config = config;
  }

  /**
   * Set the auth token for subsequent requests
   */
  setAuthToken(token: string): void {
    this.config.authToken = token;
  }

  /**
   * Configure automatic token refresh on 401 responses
   */
  setRefreshConfig(config: RefreshConfig): void {
    this.refreshConfig = config;
  }

  /**
   * Set callback invoked when a token is successfully refreshed
   */
  setOnTokenRefresh(callback: (newToken: string) => void): void {
    this.onTokenRefresh = callback;
  }

  /**
   * Set callback invoked when authentication fails (refresh also fails)
   */
  setOnAuthError(callback: (error: APIError) => void): void {
    this.onAuthError = callback;
  }

  /**
   * GET request
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<APIResponse<T>> {
    const url = this.buildUrl(path, params);
    return this.request<T>('GET', url);
  }

  /**
   * POST request
   */
  async post<T>(path: string, body?: unknown): Promise<APIResponse<T>> {
    const url = this.buildUrl(path);
    return this.request<T>('POST', url, body);
  }

  /**
   * PUT request
   */
  async put<T>(path: string, body?: unknown): Promise<APIResponse<T>> {
    const url = this.buildUrl(path);
    return this.request<T>('PUT', url, body);
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string): Promise<APIResponse<T>> {
    const url = this.buildUrl(path);
    return this.request<T>('DELETE', url);
  }

  /**
   * Build the full URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, string>): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const fullPath = `${base}${path}`;

    if (!params) return fullPath;

    const searchParams = new URLSearchParams(params);
    return `${fullPath}?${searchParams.toString()}`;
  }

  /**
   * Execute an HTTP request with error handling and optional token refresh
   */
  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
    isRetry = false,
  ): Promise<APIResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    const init: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeout = this.config.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    init.signal = controller.signal;

    try {
      const response = await fetch(url, init);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as Partial<APIError>;
        const apiError: APIError = {
          code: errorBody.code || 'UNKNOWN_ERROR',
          message: errorBody.message || response.statusText,
          statusCode: response.status,
          details: errorBody.details,
        };

        // Attempt token refresh on 401 if configured and not already retrying
        if (response.status === 401 && !isRetry && this.refreshConfig) {
          const refreshed = await this.attemptTokenRefresh();
          if (refreshed) {
            return this.request<T>(method, url, body, true);
          }
          // Refresh failed - notify and return the error
          if (this.onAuthError) {
            this.onAuthError(apiError);
          }
        }

        return {
          success: false,
          data: undefined as unknown as T,
          error: apiError,
        };
      }

      const data = (await response.json()) as APIResponse<T>;
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          data: undefined as unknown as T,
          error: {
            code: 'TIMEOUT',
            message: `Request timed out after ${timeout}ms`,
            statusCode: 408,
          },
        };
      }

      return {
        success: false,
        data: undefined as unknown as T,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network error',
          statusCode: 0,
        },
      };
    }
  }

  /**
   * Attempt to refresh the access token. Deduplicates concurrent refresh attempts.
   */
  private async attemptTokenRefresh(): Promise<boolean> {
    if (!this.refreshConfig) return false;

    // Deduplicate concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<boolean> {
    if (!this.refreshConfig) return false;

    const { endpoint, getRefreshToken } = this.refreshConfig;
    const refreshToken = getRefreshToken();

    if (!refreshToken) return false;

    try {
      const base = this.config.baseUrl.replace(/\/$/, '');
      const url = `${base}${endpoint}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const data = (await response.json()) as { accessToken?: string; token?: string };
      const newToken = data.accessToken || data.token;

      if (newToken) {
        this.config.authToken = newToken;
        if (this.onTokenRefresh) {
          this.onTokenRefresh(newToken);
        }
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }
}
