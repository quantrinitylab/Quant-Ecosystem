// ============================================================================
// QuantChat - Client auth-session bridge
// ============================================================================
//
// Bridges the phone-OTP sign-in tokens between:
//   - localStorage (the shared `useAuth` hook reads `quant_access_token` here
//     and resolves the real user via `/api/auth/userinfo`), and
//   - the in-memory `apiClient` singleton (which attaches the bearer to every
//     data request: conversations, stories, channels, ...).
//
// On a fresh page load the apiClient starts tokenless, so `bootstrapSession()`
// must re-hydrate it from localStorage before authed data fetches fire. All
// storage access is guarded for SSR (no `window` on the server) so this module
// is safe to import from client components rendered during SSR.

import { apiClient } from '../services/api-client';
import { apiFetchRaw } from '@quant/api-client';

// Same keys the shared `@quant/shared-ui` useAuth hook uses.
const ACCESS_TOKEN_KEY = 'quant_access_token';
const REFRESH_TOKEN_KEY = 'quant_refresh_token';
const DEVICE_ID_KEY = 'quantchat_device_id';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let callbacksWired = false;

/**
 * Wire the apiClient's session callbacks ONCE:
 *  - onTokenRefresh: a rotated token pair must be PERSISTED, not just held
 *    in memory. Without this, a refresh "succeeded" for the current page
 *    but the next reload bootstrapped the stale stored pair — and once the
 *    stored refresh token was superseded, the session died silently.
 *  - onAuthError: a 401 the refresh could not recover means the session is
 *    dead. Clear every stored trace so the app fails closed to /login
 *    instead of retrying forever with a corpse token.
 */
function wireSessionCallbacks(): void {
  if (callbacksWired) return;
  callbacksWired = true;
  apiClient.setCallbacks({
    onTokenRefresh: (tokens) => {
      persistSession(tokens.accessToken, tokens.refreshToken);
    },
    onAuthError: () => {
      clearSession();
    },
  });
}

/**
 * Stable per-device id. The apiClient used to mint a random deviceId on
 * every page load, so the `deviceId` sent with /auth/refresh never matched
 * anything durable. Persist one id and hand it to the apiClient.
 */
function stableDeviceId(): string | null {
  const s = storage();
  if (!s) return null;
  let id = s.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
    s.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function primeDeviceId(): void {
  const id = stableDeviceId();
  if (id) apiClient.setDeviceId(id);
}

/** Persist OTP-issued or SSO-ingested tokens and prime the apiClient for the current session. */
export function persistSession(accessToken: string, refreshToken: string): void {
  wireSessionCallbacks();
  primeDeviceId();
  const s = storage();
  if (s) {
    s.setItem(ACCESS_TOKEN_KEY, accessToken);
    s.setItem('quant_auth_token', accessToken);
    s.setItem('token', accessToken);
    s.setItem('quant_token', accessToken);
    s.setItem('quantchat_access_token', accessToken);
    if (refreshToken) s.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  apiClient.setTokens(accessToken, refreshToken);
}

/** Re-hydrate the apiClient bearer from a stored token (call once on mount). */
export function bootstrapSession(): boolean {
  wireSessionCallbacks();
  primeDeviceId();
  const s = storage();
  if (!s) return false;
  const accessToken =
    s.getItem(ACCESS_TOKEN_KEY) ||
    s.getItem('quant_auth_token') ||
    s.getItem('token') ||
    s.getItem('quant_token') ||
    s.getItem('quantchat_access_token');
  if (!accessToken) return false;
  // Only a real stored refresh token may be used as one. This used to fall
  // back to the ACCESS token (`?? accessToken`), which sent the access
  // token to /auth/refresh — the wrong credential for the wrong endpoint.
  // With no stored refresh token the apiClient gets an empty refresh token,
  // so a 401 fails closed via onAuthError instead of a bogus refresh.
  const refreshToken = s.getItem(REFRESH_TOKEN_KEY) ?? '';
  apiClient.setTokens(accessToken, refreshToken);
  return true;
}

/** Clear the stored session AND the apiClient's in-memory tokens. */
export function clearSession(): void {
  wireSessionCallbacks();
  apiClient.clearTokens();
  const s = storage();
  if (!s) return;
  s.removeItem(ACCESS_TOKEN_KEY);
  s.removeItem('quant_auth_token');
  s.removeItem('token');
  s.removeItem('quant_token');
  s.removeItem('quantchat_access_token');
  s.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Full sign-out: expire the HttpOnly session cookies server-side (the
 * /api/auth/logout route — the cookies were set by the Next proxies, so
 * only a Next response can delete them), then clear every local trace.
 * Best-effort network, unconditional local clear: a user who taps
 * "Sign out" offline is still signed out on this device.
 */
export async function signOut(): Promise<void> {
  try {
    await apiFetchRaw('/api/auth/logout', { method: 'POST' });
  } catch {
    // Offline sign-out still clears locally below.
  }
  clearSession();
}
