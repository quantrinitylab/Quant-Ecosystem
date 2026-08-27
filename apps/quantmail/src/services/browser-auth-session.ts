// Browser-only authentication boundary.
// Refresh credentials never enter JavaScript; only the short-lived access token
// returned by /auth/login, /auth/register, or /auth/refresh is held in module memory.

// Auth routes stay on /auth/* so the browser sends the HttpOnly refresh cookie
// (Path=/auth). A Next route handler proxies them at runtime using the server-only
// QUANTMAIL_BACKEND_URL and always fails closed with a JSON response.
const AUTH_BASE_URL = (process.env.NEXT_PUBLIC_AUTH_URL ?? '').replace(/\/$/, '');

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

export interface BrowserRegistration {
  email: string;
  username: string;
  displayName: string;
  password: string;
  acceptTerms: boolean;
}

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthResponse<BrowserAccessSession>> | null = null;

const endpoint = (path: string): string => `${AUTH_BASE_URL}${path}`;

const post = async <T>(path: string, body?: unknown): Promise<AuthResponse<T>> => {
  try {
    const response = await fetch(endpoint(path), {
      method: 'POST',
      credentials: 'include',
      // Only advertise a JSON body when one exists: Fastify rejects an empty
      // body with Content-Type: application/json (FST_ERR_CTP_EMPTY_JSON_BODY),
      // which used to break /auth/refresh and log users out on every reload.
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    const isJson = contentType.includes('application/json') || contentType.includes('+json');
    if (!isJson) {
      return {
        success: false,
        error: {
          code: 'AUTH_INVALID_RESPONSE',
          message: 'The authentication service returned an invalid response.',
          statusCode: response.status,
        },
      };
    }

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
  } catch {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'The authentication service is temporarily unavailable.',
        statusCode: 0,
      },
    };
  }
};

const rememberAccess = (response: AuthResponse<BrowserAccessSession>) => {
  accessToken = response.success && response.data?.accessToken ? response.data.accessToken : null;
  return response;
};

export const cleanupLegacyBrowserTokens = (): void => {
  if (typeof window === 'undefined') return;
  for (const key of LEGACY_TOKEN_KEYS) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};

const refreshOnce = async (): Promise<AuthResponse<BrowserAccessSession>> => {
  if (!refreshInFlight) {
    refreshInFlight = post<BrowserAccessSession>('/auth/refresh')
      .then(rememberAccess)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

export const browserAuthSession = {
  async login(email: string, password: string): Promise<AuthResponse<BrowserAccessSession>> {
    return rememberAccess(await post<BrowserAccessSession>('/auth/login', { email, password }));
  },

  async register(data: BrowserRegistration): Promise<AuthResponse<BrowserAccessSession>> {
    return rememberAccess(await post<BrowserAccessSession>('/auth/register', data));
  },

  async refresh(): Promise<AuthResponse<BrowserAccessSession>> {
    return refreshOnce();
  },

  async logout(): Promise<void> {
    try {
      await post<{ message: string }>('/auth/logout');
    } finally {
      accessToken = null;
    }
  },

  clearAccessToken(): void {
    accessToken = null;
  },

  getAccessToken(): string | null {
    return accessToken;
  },

  async authenticatedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
    allowRefreshRetry = true,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

    const response = await fetch(input, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (response.status !== 401 || !allowRefreshRetry) return response;

    const refreshed = await refreshOnce();
    if (!refreshed.success || !accessToken) return response;

    const retryHeaders = new Headers(init.headers);
    retryHeaders.set('Authorization', `Bearer ${accessToken}`);
    return fetch(input, {
      ...init,
      headers: retryHeaders,
      credentials: 'include',
    });
  },
};
