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

// Same keys the shared `@quant/shared-ui` useAuth hook uses.
const ACCESS_TOKEN_KEY = 'quant_access_token';
const REFRESH_TOKEN_KEY = 'quant_refresh_token';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Persist OTP-issued or SSO-ingested tokens and prime the apiClient for the current session. */
export function persistSession(accessToken: string, refreshToken: string): void {
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
  const s = storage();
  if (!s) return false;
  const accessToken =
    s.getItem(ACCESS_TOKEN_KEY) ||
    s.getItem('quant_auth_token') ||
    s.getItem('token') ||
    s.getItem('quant_token') ||
    s.getItem('quantchat_access_token');
  if (!accessToken) return false;
  const refreshToken = s.getItem(REFRESH_TOKEN_KEY) ?? accessToken;
  apiClient.setTokens(accessToken, refreshToken);
  return true;
}

/** Clear the stored session (used on sign-out). */
export function clearSession(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(ACCESS_TOKEN_KEY);
  s.removeItem('quant_auth_token');
  s.removeItem('token');
  s.removeItem('quant_token');
  s.removeItem('quantchat_access_token');
  s.removeItem(REFRESH_TOKEN_KEY);
}
