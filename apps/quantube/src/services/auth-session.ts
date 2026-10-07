// ============================================================================
// Quantube — browser auth session.
// Talks only to this app's same-origin /auth/* proxy (see app/api ../auth/[action]).
// The access token lives in memory (never localStorage); the refresh token is an
// HttpOnly cookie the identity service manages. On every load the app tries to
// restore a session with /auth/refresh, and rotates before the access token expires.
// ============================================================================
import { apiClient } from './api-client';

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
  if (typeof window !== 'undefined') {
    return (
      accessToken || localStorage.getItem('quant_access_token') || localStorage.getItem('token')
    );
  }
  return accessToken;
}

function setAccessToken(token: string | null): void {
  accessToken = token;
  apiClient.setToken(token ?? '');
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('quant_access_token', token);
      localStorage.setItem('token', token);
      document.cookie = `quant_access_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
    } else {
      localStorage.removeItem('quant_access_token');
      localStorage.removeItem('token');
      document.cookie =
        'quant_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    }
  }
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
  refresh(): Promise<SessionResult> {
    return postAuth('refresh');
  },
  async logout(): Promise<void> {
    await postAuth('logout').catch(() => undefined);
    clearAccessToken();
  },
};
