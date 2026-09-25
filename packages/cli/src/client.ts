import { getApiUrl, getToken, loadConfig } from './config.js';

export class QuantCliApiError extends Error {
  public readonly status: number;
  public readonly statusCode: number;
  public readonly data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'QuantCliApiError';
    this.status = status;
    this.statusCode = status;
    this.data = data;
  }
}

export interface QuantCliClientOptions {
  apiUrl?: string;
  token?: string;
}

export class QuantCliClient {
  private customBaseUrl?: string;
  private customToken?: string;

  constructor(options?: QuantCliClientOptions | string, token?: string) {
    if (typeof options === 'string') {
      this.customBaseUrl = options;
      this.customToken = token;
    } else if (options) {
      this.customBaseUrl = options.apiUrl;
      this.customToken = options.token;
    }
  }

  private getBaseUrl(): string {
    const raw = this.customBaseUrl || getApiUrl();
    return raw.replace(/\/+$/, '');
  }

  private resolveToken(): string | undefined {
    if (this.customToken !== undefined) {
      return this.customToken;
    }
    // Automatically read from loadConfig() / getToken()
    const configToken = loadConfig().token;
    return configToken || getToken();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    options?: RequestInit,
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${baseUrl}${normalizedPath}`;

    const headers = new Headers(options?.headers);

    const token = this.resolveToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    let requestBody: any = undefined;
    if (body !== undefined && body !== null) {
      if (
        typeof body === 'string' ||
        (typeof FormData !== 'undefined' && body instanceof FormData)
      ) {
        requestBody = body;
      } else {
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        requestBody = JSON.stringify(body);
      }
    }

    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json, text/plain, */*');
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        method,
        headers,
        body: requestBody,
      });
    } catch (err: any) {
      throw new Error(`Failed to connect to Quant API at ${url}: ${err.message || String(err)}`);
    }

    if (!response.ok) {
      let errorDetails = '';
      let responseData: any = null;
      try {
        const text = await response.text();
        try {
          responseData = JSON.parse(text);
          errorDetails =
            responseData.error ||
            responseData.message ||
            responseData.details ||
            JSON.stringify(responseData);
        } catch {
          errorDetails = text || response.statusText;
        }
      } catch {
        errorDetails = response.statusText;
      }

      const descriptiveMessage = `API Error [${response.status} ${response.statusText}]: ${errorDetails || 'Request failed'}`;
      throw new QuantCliApiError(descriptiveMessage, response.status, responseData);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  async get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  async delete<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>('DELETE', path, body, options);
  }

  async put<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  async patch<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }
}
