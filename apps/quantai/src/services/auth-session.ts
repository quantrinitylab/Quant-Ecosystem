// ============================================================================
// QuantAI — browser auth session.
// Talks only to this app's same-origin /auth/* proxy (see app/api ../auth/[action]).
// The access token lives in memory (never localStorage); the refresh token is an
// HttpOnly cookie the identity service manages. On every load the app tries to
// restore a session with /auth/refresh, and rotates before the access token expires.
// ============================================================================
import { apiClient } from './api-client';
import { getAuthToken, setAuthToken, clearAuthSession, getAuthUser } from '../lib/auth';
import { apiFetchRaw } from '@quant/api-client';
import { broadcastGlobalLogout } from './ecosystem-logout';

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

/**
 * Honest logout outcome (F-182): whether the ecosystem single-logout
 * broadcast reached the bus. Local tokens are always cleared regardless —
 * a dead bus never blocks this tab's logout, it is only reported.
 */
export interface LogoutResult {
  /** True when GLOBAL_LOGOUT was emitted on the `quant_sso_bus`. */
  broadcasted: boolean;
  /** Machine-readable reason when the broadcast could not be emitted. */
  broadcastError?: string;
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
  async logout(): Promise<LogoutResult> {
    // Capture the identity BEFORE clearing: the broadcast seed carries it
    // for receivers, and clearAccessToken() wipes it from memory+storage.
    const user = getAuthUser();
    await postAuth('logout').catch(() => undefined);
    clearAccessToken();
    // Ecosystem single logout (F-182): tell QuantMail and every other Quant
    // app/tab to close their sessions. Never throws — if the bus is dead we
    // still completed this tab's logout and report the miss honestly.
    const eco = broadcastGlobalLogout(
      user ? { id: user.id, email: user.email, name: user.name } : null,
    );
    return eco.broadcasted
      ? { broadcasted: true }
      : { broadcasted: false, broadcastError: eco.reason };
  },
};
