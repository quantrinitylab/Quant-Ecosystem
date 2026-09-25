// ============================================================================
// QuantAds — browser auth session.
//
// Mirrors apps/quantsync/src/services/auth-session.ts, adapted to the routes
// QuantAds actually exposes. Every call goes to this app's own same-origin
// /api/auth/* proxy, which forwards to the QuantMail identity service — the
// ecosystem's OAuth2/OIDC root. One QuantID signs in everywhere and QuantAds
// never issues a token itself.
//
// Token handling:
//  - the access token is a short-lived bearer replayed on each call;
//  - the refresh token stays in the HttpOnly cookie QuantMail sets through the
//    proxy and is never readable from JS;
//  - the access token is stored under the SAME localStorage key the shared
//    @quant/shared-ui useAuth hook reads ('quant_access_token'), because the
//    pages under /economy still resolve their user through that hook. Writing a
//    different key would leave those pages signed out while this app believed
//    it was signed in.
// ============================================================================
import type { AuthUser } from '@quant/shared-ui';

const ACCESS_TOKEN_KEY = 'quant_access_token';
const REFRESH_TOKEN_KEY = 'quant_refresh_token';

export interface SessionData {
  accessToken?: string;
  refreshToken?: string;
  twoFactorRequired?: boolean;
  challenge?: string;
  expiresIn?: number;
}

export interface SessionResult {
  success: boolean;
  data?: SessionData;
  error?: { code?: string; message?: string };
}

/** localStorage throws in a blocked or partitioned context; treat that as absent. */
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return storage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
}

function storeTokens(data: SessionData): void {
  const store = storage();
  if (!store || !data.accessToken) return;
  store.setItem(ACCESS_TOKEN_KEY, data.accessToken);
  if (data.refreshToken) store.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
}

export function clearStoredTokens(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(ACCESS_TOKEN_KEY);
  store.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * QuantMail answers a password-only login on a 2FA account with a challenge and
 * no tokens: the password alone is not a session.
 */
export function isTwoFactorChallenge(
  data: SessionData,
): data is SessionData & { challenge: string; expiresIn?: number } {
  return Boolean(data.twoFactorRequired && data.challenge);
}

async function postAuth(
  action: string,
  options: { token?: string | null; body?: unknown } = {},
): Promise<SessionResult> {
  const { token, body } = options;
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/auth/${action}`, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => null)) as SessionResult | null;
    if (!json) {
      return {
        success: false,
        error: { code: 'INVALID_RESPONSE', message: 'Unexpected response from sign-in.' },
      };
    }
    if (json.data) storeTokens(json.data);
    return json;
  } catch {
    return {
      success: false,
      error: { code: 'NETWORK', message: 'Could not reach the sign-in service.' },
    };
  }
}

/**
 * Ask the backend to VERIFY the bearer token and return the user it belongs to.
 * The signature check happens server-side (the JWT secret never touches the
 * client). Anything short of a verified user id returns null so callers fail
 * closed — we never invent an identity.
 */
export async function fetchVerifiedUser(token: string): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const raw = (await res.json().catch(() => null)) as
      | ({ data?: Partial<AuthUser> } & Partial<AuthUser>)
      | null;
    if (!raw) return null;
    // Accept both a bare user object and a { success, data } envelope.
    const user = raw.data ?? raw;
    if (typeof user.id !== 'string' || user.id.length === 0) return null;
    return {
      id: user.id,
      email: user.email ?? '',
      username: user.username ?? '',
      displayName: user.displayName ?? user.username ?? '',
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      role: user.role ?? 'user',
    };
  } catch {
    return null;
  }
}

export const authSession = {
  login(email: string, password: string): Promise<SessionResult> {
    return postAuth('login', { body: { email, password } });
  },
  /** Best-effort revocation; the local session is cleared either way. */
  async logout(): Promise<void> {
    const token = getAccessToken();
    await postAuth('logout', { token, body: token ? { token } : {} }).catch(() => undefined);
    clearStoredTokens();
  },
};
