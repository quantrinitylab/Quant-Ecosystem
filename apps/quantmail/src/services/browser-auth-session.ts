// Browser-only authentication boundary.
// Refresh credentials never enter JavaScript; only the short-lived access token
// returned by /auth/login, /auth/register, or /auth/refresh is held in module memory.

// Auth calls go through the Next.js /api/auth/* proxy routes (edge middleware
// never intercepts /api/*). Call sites pass '/auth/<action>' paths; the
// default base '/api' makes those resolve to the proxy routes. The refresh
// cookie uses Path=/ so the browser sends it to those proxy routes and the
// edge middleware can also read it as the signed-in signal on page routes.
// A Next route handler proxies each call at runtime using the server-only
// QUANTMAIL_BACKEND_URL and always fails closed with a JSON response.
const AUTH_BASE_URL = (process.env.NEXT_PUBLIC_AUTH_URL || '/api').replace(/\/$/, '');

// QM fix qm-draft-privacy-isolation (CODEX-REVIEW 6157628718): logout must
// also drop the retired thread-reply draft namespaces — v1 (unscoped) AND
// v2 (mutable-email-scoped). Neither is attributable to a stable account
// identity, so leaving them on disk lets the next account on this browser
// restore the previous account's unsent text (v2: a reassigned address
// hands the previous holder's plaintext to the new holder). v3 keys
// (tenant + immutable-id-scoped) partition safely and survive logout for
// the account's own next sign-in. The import is lazy (dynamic) so the auth
// boundary module keeps its import graph minimal and test stubs of
// threadReplyDrafts still work.
async function purgeUnscopedThreadDrafts(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const mod = await import('../lib/threadReplyDrafts');
    mod.purgeAllLegacyThreadDraftKeys(mod.windowThreadDraftStorage());
  } catch {
    // Best effort: a storage failure must never strand a logout.
  }
}

// QM fix qm-search-history-scope (P1, same leak class as the two above):
// logout must also drop the legacy UNSCOPED recent-search key
// (`quantmail_recent_searches`) — it is not attributable to any account, so
// the next account on this browser could read the previous account's search
// queries. Account-scoped v2 keys (`quantmail_searches.v2.<immutable-id>`)
// partition safely and survive logout for the account's own next sign-in.
async function purgeLegacySearchHistory(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const mod = await import('../lib/searchHistory');
    mod.purgeLegacyRecentSearchKeys(mod.windowSearchHistoryStorage());
  } catch {
    // Best effort: a storage failure must never strand a logout.
  }
}

async function purgeLegacyContactNames(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const mod = await import('../lib/contactNameCache');
    mod.purgeLegacyContactNameKeys(mod.windowContactNameStorage());
  } catch {
    // Best effort: a storage failure must never strand a logout.
  }
}

// QM fix qm-booking-links-scope (P1, same leak class as the three above):
// logout must also drop the legacy UNSCOPED booking-links key
// (`quant_calendar_booking_links`) — it is not attributable to any account,
// so the next account on this browser could read the previous account's
// shareable booking-link slugs/titles. Account-scoped v2 keys
// (`quant_calendar_booking_links.v2.<immutable-id>`) partition safely and
// survive logout for the account's own next sign-in.
async function purgeLegacyBookingLinks(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const mod = await import('../lib/bookingLinks');
    mod.purgeLegacyBookingLinksKeys(mod.windowBookingLinksStorage());
  } catch {
    // Best effort: a storage failure must never strand a logout.
  }
}

// QM fix qm-drive-doc-cache-scope (P1, same leak class as the draft P0
// above): logout must also drop legacy unscoped doc-content cache keys
// (`quant_doc_<docId>`) — they are NOT attributable to any account, so the
// next account on this browser could restore the previous account's cached
// document content. Account-scoped v2 keys (`quant_doc.v2.<account>.<docId>`)
// partition safely and survive logout for the account's own next sign-in.
async function purgeUnscopedDocCaches(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const mod = await import('../lib/docContentCache');
    mod.purgeLegacyDocCacheKeys(mod.windowDocCacheStorage());
  } catch {
    // Best effort: a storage failure must never strand a logout.
  }
}

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

/**
 * The profile the backend embeds in /auth/refresh, /auth/login, /auth/register
 * and /auth/2fa/verify responses (same shape as GET /oauth/userinfo). Lets the
 * auth provider hydrate the session in one round trip; absent on older
 * backends, where the provider falls back to /oauth/userinfo.
 */
export interface BrowserSessionUser {
  id: string;
  email: string;
  username: string;
  displayName?: string | null;
  role?: string | null;
}

export interface BrowserAccessSession {
  accessToken: string;
  expiresIn: number;
  tokenType?: string;
  user?: BrowserSessionUser | null;
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
      // qm-draft-privacy-isolation: v1 thread-reply draft keys are unscoped
      // plaintext the next account could restore — purge them at session
      // end. Account-scoped v2 keys partition safely and survive for the
      // account's own next sign-in.
      await purgeUnscopedThreadDrafts();
      // qm-drive-doc-cache-scope: legacy unscoped doc-content cache keys are
      // the same leak class — purge them too. v2 account-scoped keys survive.
      await purgeUnscopedDocCaches();
      // qm-search-history-scope: the legacy unscoped recent-search key is
      // the same leak class — purge it too. v2 account-scoped keys survive.
      await purgeLegacySearchHistory();
      // qm-contact-names-scope: the legacy unscoped contact-rename key is
      // the same leak class — purge it too. v2 account-scoped keys survive.
      await purgeLegacyContactNames();
      // qm-booking-links-scope: the legacy unscoped booking-links key is the
      // same leak class (shareable meeting slugs/titles) — purge it too. v2
      // account-scoped keys survive.
      await purgeLegacyBookingLinks();
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
