// Browser-only authentication boundary.
// Refresh credentials never enter JavaScript; only the short-lived access token
// returned by /auth/login, /auth/register, or /auth/refresh is held in module memory.

// Auth routes stay on /auth/* so the browser sends the HttpOnly refresh cookie
// (Path=/auth). A Next route handler proxies them at runtime using the server-only
// QUANTMAIL_BACKEND_URL and always fails closed with a JSON response.
const AUTH_BASE_URL = (process.env.NEXT_PUBLIC_AUTH_URL ?? '').replace(/\/$/, '');

/**
 * Global ceiling for any single authenticated request (including one 401
 * refresh retry). Mirrors the PR #621 auth-check pattern: a hung backend must
 * surface as an error, never an infinite spinner.
 */
const FETCH_TIMEOUT_MS = 30_000;

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

/**
 * What `/auth/login` answers when the password was right but the account has a
 * second factor: no tokens, no refresh cookie, just a short-lived challenge
 * naming the account. Held in memory only — writing it to storage would put a
 * half-authentication on disk for every tab to find.
 */
export interface BrowserTwoFactorChallenge {
  twoFactorRequired: true;
  challenge: string;
  expiresIn: number;
}

export type BrowserLoginResult = BrowserAccessSession | BrowserTwoFactorChallenge;

export const isTwoFactorChallenge = (
  data: BrowserLoginResult | undefined,
): data is BrowserTwoFactorChallenge =>
  Boolean(data && (data as BrowserTwoFactorChallenge).twoFactorRequired);

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
  // The session-establishing calls (login/register/refresh/2FA/logout) get
  // the same global timeout as authenticatedFetch: an auth backend that
  // accepts the connection and never answers must not leave the sign-in
  // spinner hanging forever.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('Request timed out after 30 seconds')),
    FETCH_TIMEOUT_MS,
  );
  try {
    const response = await fetch(endpoint(path), {
      method: 'POST',
      credentials: 'include',
      // Only advertise a JSON body when one exists: Fastify rejects an empty
      // body with Content-Type: application/json (FST_ERR_CTP_EMPTY_JSON_BODY),
      // which used to break /auth/refresh and log users out on every reload.
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
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
  } catch (error) {
    // A timeout abort rejects with our reason (or a TimeoutError); surface it
    // distinctly — mirroring api-client's TIMEOUT code — so sign-in UIs can
    // say "timed out" instead of a generic network failure.
    const timedOut =
      error instanceof Error && (/timed out/i.test(error.message) || error.name === 'TimeoutError');
    if (timedOut) {
      return {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'The authentication service timed out. Please try again.',
          statusCode: 0,
        },
      };
    }
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'The authentication service is temporarily unavailable.',
        statusCode: 0,
      },
    };
  } finally {
    clearTimeout(timer);
  }
};

// A login can now answer without an access token (2FA outstanding), so this
// reads the field defensively rather than assuming the success shape.
const rememberAccess = <T>(response: AuthResponse<T>): AuthResponse<T> => {
  const data = response.data as { accessToken?: string } | undefined;
  accessToken = response.success && data?.accessToken ? data.accessToken : null;
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
  async login(email: string, password: string): Promise<AuthResponse<BrowserLoginResult>> {
    return rememberAccess(await post<BrowserLoginResult>('/auth/login', { email, password }));
  },

  /**
   * Second leg of a two-factor login. `code` is either the 6-digit
   * authenticator code or one of the printed recovery codes — the backend
   * decides which by shape, so the UI needs one field, not two.
   */
  async completeTwoFactor(
    challenge: string,
    code: string,
  ): Promise<AuthResponse<BrowserAccessSession>> {
    return rememberAccess(
      await post<BrowserAccessSession>('/auth/2fa/verify', { challenge, code }),
    );
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

  /**
   * Global request timeout for every authenticated fetch. A backend that
   * accepts a connection and never responds must not leave spinners hanging
   * forever — the timeout aborts the request so callers land on their honest
   * error state + retry. The caller's own signal (e.g. React Query
   * cancellation) is still honored: either abort source wins.
   */
  async authenticatedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
    allowRefreshRetry = true,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

    const controller = new AbortController();
    const callerSignal = init.signal;
    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort(callerSignal.reason);
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
    const timer = setTimeout(
      () => controller.abort(new Error('Request timed out after 30 seconds')),
      FETCH_TIMEOUT_MS,
    );

    try {
      const response = await fetch(input, {
        ...init,
        headers,
        credentials: 'include',
        signal: controller.signal,
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
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  },
};
