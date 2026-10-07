// ============================================================================
// QuantAI — browser auth session.
// Talks only to this app's same-origin /auth/* proxy (see app/api ../auth/[action]).
// The access token lives in memory (never localStorage); the refresh token is an
// HttpOnly cookie the identity service manages. On every load the app tries to
// restore a session with /auth/refresh, and rotates before the access token expires.
// ============================================================================
import { apiClient } from './api-client';
import { getAuthToken, setAuthToken, clearAuthSession } from '../lib/auth';

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
export function ingestSSOToken(token: string): void {
  setAccessToken(token);
  setAuthToken(token);
}

export function isTwoFactorChallenge(
  data: SessionData,
): data is SessionData & { challenge: string; expiresIn: number } {
  return Boolean(data.twoFactorRequired && data.challenge);
}

async function postAuth(action: string, body?: unknown): Promise<SessionResult> {
  try {
    const res = await fetch(`/auth/${action}`, {
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
      setAuthToken(json.data.accessToken);
    }
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
  async refresh(): Promise<SessionResult> {
    const res = await postAuth('refresh');
    if (res.success && res.data?.accessToken) {
      return res;
    }
    // Fallback: If an SSO token is stored in localStorage or cookie, re-hydrate from it
    const stored = getAuthToken();
    if (stored) {
      setAccessToken(stored);
      return { success: true, data: { accessToken: stored } };
    }
    return res;
  },
  async logout(): Promise<void> {
    await postAuth('logout').catch(() => undefined);
    clearAccessToken();
  },
};
