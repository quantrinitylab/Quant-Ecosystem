// ============================================================================
// QuantAI — browser auth session.
// Talks only to this app's same-origin /auth/* proxy (see app/api ../auth/[action]).
// The access token lives in memory (never localStorage); the refresh token is an
// HttpOnly cookie the identity service manages. On every load the app tries to
// restore a session with /auth/refresh, and rotates before the access token expires.
// ============================================================================
import { apiClient } from './api-client';
import { getAuthToken, setAuthToken, clearAuthSession } from '../lib/auth';
import { apiFetchRaw } from '@quant/api-client';

export interface SessionData {
  accessToken?: string;
  twoFactorRequired?: boolean;
  challenge?: string;
  expiresIn?: number;
  user?: {
    id: string;
    email: string;
    username?: string;
    displayName?: string | null;
    name?: string;
  } | null;
}

export interface SessionResult {
  success: boolean;
  data?: SessionData;
  error?: { code?: string; message?: string };
}

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken || getAuthToken();
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  apiClient.setToken(token ?? '');
}

export function clearAccessToken(): void {
  setAccessToken(null);
  clearAuthSession();
}

/** Ingests an SSO ticket/token, syncing memory, apiClient, and localStorage. */
export function ingestSSOToken(
  token: string,
  user?: { id: string; email: string; name?: string } | null,
): void {
  setAccessToken(token);
  setAuthToken(token, user ?? null);
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
    if (json.data?.accessToken) {
      setAccessToken(json.data.accessToken);
      // Persist the user profile too — without it the UI falls back to
      // fabricated placeholders like 'user@quantmail.in'.
      const u = json.data.user;
      setAuthToken(
        json.data.accessToken,
        u
          ? {
              id: u.id,
              email: u.email,
              name: u.displayName ?? u.name ?? u.username,
            }
          : null,
      );
    }
    return json;
  } catch {
    return {
      success: false,
      error: { code: 'NETWORK', message: 'Could not reach the sign-in service.' },
    };
  }
}

/**
 * Query param set on the /login redirect when the session died server-side
 * (expired/revoked refresh cookie), so the login page can say WHY the user
 * was signed out instead of showing a bare sign-in form.
 */
export const SESSION_EXPIRED_REASON = 'session-expired';

export const authSession = {
  login(email: string, password: string): Promise<SessionResult> {
    return postAuth('login', { email, password });
  },
  async refresh(): Promise<SessionResult> {
    const res = await postAuth('refresh');
    if (res.success && res.data?.accessToken) {
      return res;
    }
    // The server refused to rotate the session (expired/revoked refresh
    // cookie, or no session at all). NEVER resurrect the stale local token:
    // the old fallback re-hydrated localStorage and returned success:true,
    // so the rotation timer kept reporting success for a server-revoked
    // session (F-203) — defeating server-side revocation. Clear every bit of
    // local token material so the revocation actually takes effect, and
    // return the genuine failure so every caller signs the user out.
    clearAccessToken();
    if (!res.success) {
      return res;
    }
    // Server answered "clean, no session" (NO_SESSION) without an error
    // payload: a refresh that yields no fresh token is NOT a successful
    // refresh. Report it as a failure so callers clear the session.
    return {
      success: false,
      data: res.data,
      error: res.error ?? {
        code: 'NO_SESSION',
        message: 'Your session expired. Sign in again.',
      },
    };
  },
  async logout(): Promise<void> {
    await postAuth('logout').catch(() => undefined);
    clearAccessToken();
  },
};
