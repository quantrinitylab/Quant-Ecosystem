// ============================================================================
// QuantWave — browser auth session.
// Talks only to this app's same-origin /auth/* proxy (see app/auth/[action]).
// The access token lives in memory (never localStorage); the refresh token is an
// HttpOnly cookie the identity service manages. On every load the app tries to
// restore a session with /auth/refresh, and rotates before the access token expires.
// ============================================================================
import { quantSyncAPI } from './api-client';

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

// ============================================================================
// SSO callback completion.
// QuantMail hands the session back by redirecting to /login with the
// QuantMail-issued JWT in the URL (`?token=…&accessToken=…&__quant_sso_ticket=…`).
// That token is NOT valid for QuantWave's backend directly — it must be
// exchanged server-side (POST /api/auth/sso/login → Fastify /auth/sso/login,
// which validates it as a cross-app token). On success the resulting session
// credential is stored in memory exactly like a password login; the caller
// must scrub the token params from the URL (history.replaceState) so the
// credential never lingers in the address bar or browser history.
// ============================================================================
export async function completeSSO(quantMailToken: string): Promise<SessionResult> {
  const token = quantMailToken?.trim();
  if (!token) {
    return {
      success: false,
      error: {
        code: 'SSO_MISSING_TOKEN',
        message: 'The Quant Account sign-in did not include a token. Please try again.',
      },
    };
  }
  try {
    const res = await quantSyncAPI.loginWithSSO(token);
    const accessToken = res.success ? res.data?.accessToken : undefined;
    if (!accessToken) {
      return {
        success: false,
        error: {
          code: res.error?.code ?? 'SSO_EXCHANGE_FAILED',
          message: 'The Quant Account sign-in could not be completed. Please try again.',
        },
      };
    }
    setAccessToken(accessToken);
    return { success: true, data: { accessToken } };
  } catch (caught) {
    // The exchange endpoint answers 401 for a rejected/invalid QuantMail
    // token; anything else is the sign-in service being unreachable.
    const rejected = caught instanceof Error && caught.name === 'AuthRequiredError';
    return {
      success: false,
      error: {
        code: rejected ? 'SSO_REJECTED' : 'SSO_EXCHANGE_FAILED',
        message: rejected
          ? 'The Quant Account sign-in was rejected. Please try again.'
          : 'Could not reach the sign-in service.',
      },
    };
  }
}
