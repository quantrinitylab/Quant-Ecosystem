/**
 * HTTP Client for Agentic Layer
 *
 * Lightweight fetch-based HTTP client that agent tools use to call
 * real app backends. Handles auth tokens, base URLs from env vars,
 * timeouts, and graceful fallback when services are unreachable.
 */

import { logger } from '@quant/common';

export interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
  authToken?: string;
  headers?: Record<string, string>;
}

export interface HttpResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
}

export class HttpClient {
  private baseUrl: string;
  private timeout: number;
  private authToken?: string;
  private headers: Record<string, string>;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 10000;
    this.authToken = config.authToken;
    this.headers = config.headers ?? {};
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers,
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  async get<T = any>(path: string, params?: Record<string, any>): Promise<HttpResponse<T>> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.set(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += `?${qs}`;
      }
    }
    return this.request<T>('GET', url);
  }

  async post<T = any>(path: string, body?: any): Promise<HttpResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    return this.request<T>('POST', url, body);
  }

  async put<T = any>(path: string, body?: any): Promise<HttpResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    return this.request<T>('PUT', url, body);
  }

  async delete<T = any>(path: string): Promise<HttpResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    return this.request<T>('DELETE', url);
  }

  private async request<T>(method: string, url: string, body?: any): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: this.buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data: any;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data: data as T,
          error:
            typeof data === 'object' && data?.message ? data.message : `HTTP ${response.status}`,
        };
      }

      return {
        ok: true,
        status: response.status,
        data: data as T,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = message.includes('aborted') || message.includes('abort');

      logger.warn(`[HttpClient] Request failed: ${method} ${url} - ${message}`);

      return {
        ok: false,
        status: 0,
        data: null as T,
        error: isTimeout
          ? `Request timeout after ${this.timeout}ms`
          : `Service unreachable: ${message}`,
      };
    }
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

/**
 * Environment variable-based client factory.
 * Creates HTTP clients for each backend service with sensible defaults.
 */
export function createQuantMailClient(authToken?: string): HttpClient {
  return new HttpClient({
    baseUrl: process.env['QUANTMAIL_API_URL'] || 'http://localhost:3001',
    authToken,
  });
}

export function createQuantChatClient(authToken?: string): HttpClient {
  return new HttpClient({
    baseUrl: process.env['QUANTCHAT_API_URL'] || 'http://localhost:3002',
    authToken,
  });
}

export function createQuantDriveClient(authToken?: string): HttpClient {
  return new HttpClient({
    baseUrl: process.env['QUANTDRIVE_API_URL'] || 'http://localhost:3003',
    authToken,
  });
}

export function createQuantMeetClient(authToken?: string): HttpClient {
  return new HttpClient({
    baseUrl: process.env['QUANTMEET_API_URL'] || 'http://localhost:3004',
    authToken,
  });
}

export function createQuantSyncClient(authToken?: string): HttpClient {
  return new HttpClient({
    baseUrl: process.env['QUANTSYNC_API_URL'] || 'http://localhost:3005',
    authToken,
  });
}
