// ============================================================================
// QuantCooks — browser auth session.
// Talks only to this app's same-origin auth routes. Tokens live ONLY in
// httpOnly + Secure + SameSite=Lax cookies minted server-side (by
// /api/auth/sso/callback for QuantMail OAuth, /api/auth/sso/ticket for /sso
// chooser tickets, or the /auth/[action] proxy for password login).
// JavaScript never sees, stores, or transmits a token — session state here is
// just the verified user profile from GET /api/auth/session.
// ============================================================================
import { apiFetchRaw } from '@quant/api-client';

export interface SessionUser {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export type SessionType = 'oauth' | 'sso-ticket';

export interface SessionData {
  user?: SessionUser;
  sessionType?: SessionType;
  twoFactorRequired?: boolean;
  challenge?: string;
  expiresIn?: number;
}

export interface SessionResult {
  success: boolean;
  data?: SessionData;
  error?: { code?: string; message?: string };
}

export type LoginOutcome =
  | { status: 'signed-in' }
  | { status: 'two-factor-required'; challenge: string; expiresIn: number };

export function isTwoFactorChallenge(
  data: SessionData,
): data is SessionData & { challenge: string; expiresIn: number } {
  return Boolean(data.twoFactorRequired && data.challenge);
}

async function requestJson(path: string, init?: RequestInit): Promise<SessionResult> {
  try {
    const res = await apiFetchRaw(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
    });
    const json = (await res.json().catch(() => null)) as SessionResult | null;
    if (!json) {
      return {
        success: false,
        error: { code: 'INVALID_RESPONSE', message: 'Unexpected response.' },
      };
    }
    return json;
  } catch {
    return {
      success: false,
      error: { code: 'NETWORK', message: 'Could not reach the sign-in service.' },
    };
  }
}

function postJson(path: string, body?: unknown): Promise<SessionResult> {
  return requestJson(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const authSession = {
  /**
   * Resolve the current session from the httpOnly cookies. The server
   * verifies the access cookie back-channel via userinfo (self-healing
   * through the OAuth refresh cookie) or accepts the signed ticket-identity
   * cookie. 401 NO_SESSION when neither verifies.
   */
  getSession(): Promise<SessionResult> {
    return requestJson('/api/auth/session');
  },

  /**
   * Username/password login. The /auth/login proxy checks the credentials
   * against the identity service and mints the httpOnly session cookie; we
   * then resolve the verified user profile.
   */
  async login(email: string, password: string): Promise<SessionResult> {
    const res = await postJson('/auth/login', { email, password });
    if (!res.success || !res.data || isTwoFactorChallenge(res.data)) return res;
    return this.getSession();
  },

  /**
   * Best-effort session rotation: password sessions rotate via the identity
   * refresh cookie; OAuth sessions self-heal inside /api/auth/session. Either
   * way the caller ends up with the current session state.
   */
  async refresh(): Promise<SessionResult> {
    await postJson('/auth/refresh').catch(() => null);
    return this.getSession();
  },

  /**
   * Complete a Contract B /sso chooser ticket (?sso_ticket=): the server
   * verifies it back-channel with QuantMail and mints the signed identity
   * session cookie. The ticket is scrubbed from the URL by the caller
   * immediately — before and regardless of this call's outcome.
   */
  async completeSsoTicket(ticket: string): Promise<SessionResult> {
    const res = await postJson('/api/auth/sso/ticket', { ticket });
    if (!res.success) return res;
    return this.getSession();
  },

  /** Sign out: the server revokes and clears every session cookie. */
  async logout(): Promise<void> {
    await postJson('/auth/logout').catch(() => undefined);
  },
};
