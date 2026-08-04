// Browser-only authentication boundary.
// Refresh credentials never enter JavaScript; only the short-lived access token
// returned by /auth/login or /auth/refresh is handed to the in-memory API client.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const LEGACY_TOKEN_KEYS = [
  'quant_auth_tokens',
  'quant_access_token',
  'quant_refresh_token',
  'token',
  'refreshToken',
] as const;

interface AuthError {
  code: string;
  message: string;
  statusCode: number;
}

interface AuthResponse<T> {
  success: boolean;
  data?: T;
  error?: AuthError;
}

export interface BrowserAccessSession {
  accessToken: string;
  expiresIn: number;
  tokenType?: string;
}

const endpoint = (path: string): string => `${API_BASE_URL}${path}`;

const post = async <T>(path: string, body?: unknown): Promise<AuthResponse<T>> => {
  try {
    const response = await fetch(endpoint(path), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await response.json()) as AuthResponse<T>;
    if (!response.ok && payload.success !== false) {
      return {
        success: false,
        error: {
          code: 'AUTH_REQUEST_FAILED',
          message: 'Authentication request failed.',
          statusCode: response.status,
        },
      };
    }
    return payload;
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Authentication request failed.',
        statusCode: 0,
      },
    };
  }
};

export const cleanupLegacyBrowserTokens = (): void => {
  if (typeof window === 'undefined') return;
  for (const key of LEGACY_TOKEN_KEYS) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};

export const browserAuthSession = {
  async login(email: string, password: string): Promise<AuthResponse<BrowserAccessSession>> {
    return post<BrowserAccessSession>('/auth/login', { email, password });
  },

  async refresh(): Promise<AuthResponse<BrowserAccessSession>> {
    return post<BrowserAccessSession>('/auth/refresh');
  },

  async logout(): Promise<void> {
    await post<{ message: string }>('/auth/logout');
  },
};
