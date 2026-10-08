// ============================================================================
// QuantWave — browser auth session.
// Talks only to this app's same-origin /auth/* proxy (see app/auth/[action]).
// The access token lives in memory (never localStorage); the refresh token is an
// HttpOnly cookie the identity service manages. On every load the app tries to
// restore a session with /auth/refresh, and rotates before the access token expires.
// ============================================================================
import { quantSyncAPI, AuthRequiredError } from './api-client';
import { apiFetchRaw } from '@quant/api-client';

export interface SessionData {
  accessToken?: string;
  twoFactorRequired?: boolean;
  challenge?: string;
  expiresIn?: number;
}

export interface SessionResult {
  success: boolean;
  data?: SessionData;
  error?: { code?: string; message?: string };
}

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

function setAccessToken(token: string | null): void {
  accessToken = token;
  quantSyncAPI.setToken(token ?? '');
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

export function isTwoFactorChallenge(
  data: SessionData,
): data is SessionData & { challenge: string; expiresIn: number } {
  return Boolean(data.twoFactorRequired && data.challenge);
}

async function postAuth(action: string, body?: unknown): Promise<SessionResult> {
  try {
    const res = await apiFetchRaw(`/auth/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => null)) as SessionResult | null;
    if (!json) {
      return {
        success: false,
        error: { code: 'INVALID_RESPONSE', message: 'Unexpected response.' },
      };
    }
    // NO_SESSION is a clean unauthenticated state, not a hard failure.
    if (json.data?.accessToken) setAccessToken(json.data.accessToken);
    return json;
  } catch {
    return {
      success: false,
      error: { code: 'NETWORK', message: 'Could not reach the sign-in service.' },
    };
  }
}

export const authSession = {
  login(email: string, password: string): Promise<SessionResult> {
    return postAuth('login', { email, password });
  },
  /**
   * Complete a "Continue with Quant SSO" round-trip.
   * Exchanges the QuantMail-issued handoff token (carried in the ?token=
   * query param the SSO chooser appends) for a QuantWave session via the
   * backend's POST /auth/sso/login, which validates the token as a
   * cross-app token server-side. The access token is stored memory-only,
   * exactly like a password login.
   */
  async exchangeSso(quantMailToken: string): Promise<SessionResult> {
    try {
      const result = await quantSyncAPI.loginWithSSO(quantMailToken);
      if (result.success && result.data?.accessToken) {
        setAccessToken(result.data.accessToken);
        return { success: true, data: { accessToken: result.data.accessToken } };
      }
      return {
        success: false,
        error: {
          code: result.error?.code ?? 'SSO_FAILED',
          message: 'The Quant SSO sign-in did not complete. Please try again.',
        },
      };
    } catch (caught) {
      // AuthRequiredError: the handoff token was rejected — already dropped
      // from the API client by its 401 handler.
      if (caught instanceof AuthRequiredError) {
        return {
          success: false,
          error: {
            code: 'SSO_INVALID',
            message: 'The Quant SSO sign-in did not complete. Please try again.',
          },
        };
      }
      return {
        success: false,
        error: { code: 'NETWORK', message: 'Could not reach the sign-in service.' },
      };
    }
  },
  refresh(): Promise<SessionResult> {
    return postAuth('refresh');
  },
  async logout(): Promise<void> {
    await postAuth('logout').catch(() => undefined);
    clearAccessToken();
  },
  /**
   * SSO login: exchange a QuantMail-issued SSO token (the `?token=` / `?accessToken=`
   * / `?__quant_sso_ticket=` param QuantMail's /sso chooser appends to the returnTo
   * URL) for a QuantWave session. The exchange runs server-side via the
   * /api/auth/sso/login proxy, which validates the token back-channel (signature +
   * expiry + cross-app scope) — the token is never trusted on its claims alone.
   * On success the validated token becomes this tab's in-memory access token.
   */
  loginWithSSO(quantMailToken: string): Promise<SessionResult> {
    return postSsoLogin(quantMailToken);
  },
};

/**
 * POST /api/auth/sso/login — the Next.js proxy forwards this to the QuantWave
 * backend's POST /auth/sso/login, which validates the QuantMail token and
 * returns { accessToken, user }. Plain Fetch API use (not the api-client): a 401 here
 * means the SSO token itself is invalid, not that an existing session died, so
 * it must NOT trigger the api-client's session-death path.
 */
async function postSsoLogin(quantMailToken: string): Promise<SessionResult> {
  try {
    const res = await apiFetchRaw('/api/auth/sso/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantMailToken }),
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => null)) as SessionResult | null;
    if (!json) {
      return {
        success: false,
        error: { code: 'INVALID_RESPONSE', message: 'Unexpected response.' },
      };
    }
    if (json.success && json.data?.accessToken) setAccessToken(json.data.accessToken);
    return json;
  } catch {
    return {
      success: false,
      error: { code: 'NETWORK', message: 'Could not reach the sign-in service.' },
    };
  }
}

/** The HttpOnly refresh cookie name the identity service issues. */
export const REFRESH_COOKIE_NAME = 'quantmail_refresh';

/**
 * True when the identity-issued refresh cookie exists. SSO-established sessions
 * have no refresh cookie (the token simply lives its natural ~15-minute life),
 * so token rotation must be skipped for them — a cookie-less /auth/refresh
 * returns NO_SESSION and would otherwise nuke a perfectly good SSO session.
 */
export function hasRefreshCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((part) => part.trim().startsWith(`${REFRESH_COOKIE_NAME}=`));
}
