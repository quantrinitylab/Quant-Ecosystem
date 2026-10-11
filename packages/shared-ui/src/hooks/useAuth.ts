'use client';
// ============================================================================
// Shared UI - useAuth Hook (real, backend-verified identity)
// ============================================================================
//
// Resolves the current user from a REAL, backend-verified identity — never a
// fabricated one. It mirrors the QuantMail reference provider
// (apps/quantmail/src/providers/auth-provider.tsx): the browser holds only the
// bearer token and asks a backend userinfo endpoint (OIDC `/oauth/userinfo`,
// exposed per-app as `/api/auth/userinfo`) to VERIFY the token and return the
// user. The signature check happens server-side (the JWT secret never touches
// the client). FAIL CLOSED: no token / invalid token / unconfigured endpoint =>
// unauthenticated (we never invent a `user_<timestamp>` or a `mock_token`).

import { useState, useCallback, useEffect } from 'react';
import { UniversalSSOTokenBridge } from '../interconnection/UniversalSSOTokenBridge';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  kycStatus?: 'verified' | 'pending' | 'none';
}

export interface UseAuthReturn {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: {
    email: string;
    username: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  refreshToken: () => Promise<void>;
  /**
   * Complete a Contract B /sso chooser ticket (?sso_ticket=). Cookie mode
   * only: the server verifies the ticket back-channel and mints the session
   * cookies; the hook then re-resolves the user. The caller must scrub the
   * ticket from the URL BEFORE calling this.
   */
  completeSsoTicket: (ticket: string) => Promise<void>;
}

/** Endpoints the hook talks to. Each app proxies these to QuantMail OAuth2. */
export interface QuantAuthEndpoints {
  /** OIDC userinfo — verifies the bearer token and returns the user. */
  userInfoUrl: string;
  /** Credential -> token exchange (returns { accessToken, refreshToken? }). */
  loginUrl: string;
  /** New-account registration (returns { accessToken, refreshToken? }). */
  registerUrl: string;
  /** Optional token revocation on logout. */
  logoutUrl?: string;
  /**
   * 'token' (default): the browser holds the bearer token in localStorage and
   * sends it as an Authorization header — legacy mode.
   * 'cookie': tokens live ONLY in httpOnly cookies minted server-side; the
   * hook never touches a token and resolves identity from the cookie session
   * (credentials: 'include', no Authorization header). New SSO apps use this.
   */
  sessionMode?: 'cookie' | 'token';
  /** Contract B ticket endpoint (cookie mode): verifies an ?sso_ticket=. */
  ssoTicketUrl?: string;
}

const DEFAULT_ENDPOINTS: QuantAuthEndpoints = {
  userInfoUrl: '/api/auth/userinfo',
  loginUrl: '/api/auth/login',
  registerUrl: '/api/auth/register',
  logoutUrl: '/api/auth/logout',
  sessionMode: 'token',
  ssoTicketUrl: '/api/auth/sso/ticket',
};

let endpoints: QuantAuthEndpoints = { ...DEFAULT_ENDPOINTS };

/**
 * Point the auth hook at an app's own auth proxy routes (which forward to the
 * QuantMail OAuth2 provider). Call once at app bootstrap if the defaults under
 * `/api/auth/*` are not correct.
 */
export function configureQuantAuth(overrides: Partial<QuantAuthEndpoints>): void {
  endpoints = { ...endpoints, ...overrides };
}

const ACCESS_TOKEN_KEY = 'quant_access_token';
const REFRESH_TOKEN_KEY = 'quant_refresh_token';

interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
}

/**
 * Authentication hook — real, backend-verified identity across all Quant apps.
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cookieMode = endpoints.sessionMode === 'cookie';

  // On mount, resolve the session. Cookie mode: the server verifies the
  // httpOnly cookies back-channel (no token in JS, no Authorization header).
  // Token mode (legacy): resolve the stored token against userinfo, with the
  // bridge handoff as a fallback. Any failure clears the session (fail
  // closed) — never a fabricated fallback identity.
  useEffect(() => {
    let cancelled = false;
    const checkAuth = async () => {
      if (cookieMode) {
        try {
          const userData = await fetchUserFromSession();
          if (!cancelled) setUser(userData);
        } catch {
          if (!cancelled) setUser(null);
        } finally {
          if (!cancelled) setIsLoading(false);
        }
        return;
      }

      let token = getStoredToken();
      if (!token) {
        try {
          const bridge = UniversalSSOTokenBridge.getInstance();
          const consumed = await bridge.consumeHandoffTicket();
          if (consumed?.ticket) {
            token = consumed.session?.token || consumed.ticket;
            storeTokens({ accessToken: token });
          }
        } catch {
          // Sandboxed environment
        }
      }

      if (!token) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const userData = await fetchUserFromToken(token);
        if (!cancelled) setUser(userData);
      } catch (err) {
        const isAuthError =
          err instanceof Error &&
          (err.message.includes('401') ||
            err.message.includes('403') ||
            err.message.includes('verified user id'));
        if (isAuthError) {
          clearStoredTokens();
          if (!cancelled) setUser(null);
        } else {
          // Network error or server unreachable: fail closed. We must not
          // invent an identity (the old code fabricated an 'offline' user).
          if (!cancelled) setUser(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void checkAuth();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookieMode]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (cookieMode) {
        // Cookie mode: the server mints the httpOnly session cookies on
        // login; the hook never sees a token.
        await postForCookieSession(endpoints.loginUrl, { email, password });
        const userData = await fetchUserFromSession();
        setUser(userData);
        return;
      }
      const tokens = await postForTokens(endpoints.loginUrl, { email, password });
      storeTokens(tokens);
      const userData = await fetchUserFromToken(tokens.accessToken);
      setUser(userData);
    } catch (err) {
      clearStoredTokens();
      setUser(null);
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookieMode]);

  const register = useCallback(
    async (data: { email: string; username: string; password: string; displayName: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const tokens = await postForTokens(endpoints.registerUrl, data);
        storeTokens(tokens);
        const userData = await fetchUserFromToken(tokens.accessToken);
        setUser(userData);
      } catch (err) {
        clearStoredTokens();
        setUser(null);
        const message = err instanceof Error ? err.message : 'Registration failed';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    if (cookieMode) {
      // Cookie mode: the server revokes and clears the session cookies.
      if (endpoints.logoutUrl) {
        try {
          await fetch(endpoints.logoutUrl, {
            method: 'POST',
            credentials: 'include',
          });
        } catch {
          // Best effort — clear locally regardless of revocation result.
        }
      }
      setUser(null);
      setError(null);
      return;
    }
    const token = getStoredToken();
    if (token && endpoints.logoutUrl) {
      try {
        await fetch(endpoints.logoutUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Best effort — clear locally regardless of revocation result.
      }
    }
    clearStoredTokens();
    setUser(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookieMode]);

  const refreshToken = useCallback(async () => {
    if (cookieMode) {
      // Cookie mode: re-resolve the cookie session (the server self-heals
      // OAuth sessions through the refresh cookie).
      try {
        const userData = await fetchUserFromSession();
        setUser(userData);
      } catch {
        setUser(null);
      }
      return;
    }
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      // Re-resolve identity; if the token is no longer valid, fail closed.
      const userData = await fetchUserFromToken(token);
      setUser(userData);
    } catch (err) {
      const isAuthError =
        err instanceof Error &&
        (err.message.includes('401') ||
          err.message.includes('403') ||
          err.message.includes('verified user id'));
      if (isAuthError) {
        clearStoredTokens();
        setUser(null);
      }
    }
  }, [cookieMode]);

  const completeSsoTicket = useCallback(
    async (ticket: string) => {
      if (!cookieMode) {
        throw new Error('SSO tickets require cookie session mode.');
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(endpoints.ssoTicketUrl ?? '/api/auth/sso/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({ ticket }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            body?.error?.message ?? 'The QuantMail sign-in ticket was rejected.',
          );
        }
        const userData = await fetchUserFromSession();
        setUser(userData);
      } catch (err) {
        setUser(null);
        const message = err instanceof Error ? err.message : 'QuantMail sign-in failed.';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cookieMode],
  );

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    logout,
    register,
    refreshToken,
    completeSsoTicket,
  };
}

// ---------------------------------------------------------------------------
// Real identity resolution + token storage (no fabrication anywhere)
// ---------------------------------------------------------------------------

/**
 * Ask the backend userinfo endpoint to VERIFY the token and return the user.
 * Throws on any non-ok response so callers fail closed. The request has a
 * hard timeout so a hanging network can never trap the UI on a loading state
 * forever (P1: session spinner with no timeout).
 *
 * Fail-closed identity: the provider must return a verified id (or sub).
 * Fallback display values are kept minimal and honest — we never invent an
 * identity, but a missing display name degrades to the username/email rather
 * than blocking sign-in.
 */
async function fetchUserFromToken(token: string): Promise<AuthUser> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(endpoints.userInfoUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('userinfo timed out after 10s');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(`userinfo failed: ${res.status}`);
  }
  const raw = (await res.json()) as any;
  // Accept both a bare user object and a { success, data } envelope.
  const userData = raw.data?.user || raw.data || raw.user || raw;
  return toAuthUser(userData);
}

/**
 * Cookie session mode: resolve the user from the httpOnly cookies. No
 * Authorization header is sent (JS holds no token); the server verifies the
 * cookies back-channel. Throws when there is no verified session.
 */
async function fetchUserFromSession(): Promise<AuthUser> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(endpoints.userInfoUrl, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('session check timed out after 10s');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(`session check failed: ${res.status}`);
  }
  const raw = (await res.json()) as any;
  const userData = raw.data?.user || raw.data || raw.user || raw;
  return toAuthUser(userData);
}

/**
 * Normalize a server-verified user payload into an AuthUser. Throws when the
 * payload carries no verified id — we never fabricate one ('user_me' etc.).
 */
function toAuthUser(userData: any): AuthUser {
  const id = userData?.id || userData?.sub;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('userinfo returned no verified user id');
  }
  return {
    id,
    email: userData.email || '',
    username: userData.username || (userData.email ? userData.email.split('@')[0] : 'user'),
    displayName: userData.displayName || userData.name || userData.username || 'Quant User',
    avatarUrl: userData.avatarUrl || userData.picture || null,
    role: userData.role || 'USER',
    phoneNumber: userData.phoneNumber || null,
    phoneVerified: Boolean(userData.phoneVerified),
    kycStatus: userData.phoneVerified ? 'verified' : 'pending',
  };
}

/**
 * Cookie-mode credential login: the server sets the httpOnly session cookies
 * and answers with the login result. Throws when the credentials are
 * rejected. Never handles tokens client-side.
 */
async function postForCookieSession(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const raw = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(raw?.error?.message ?? `auth request failed: ${res.status}`);
  }
}

async function postForTokens(url: string, body: unknown): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`auth request failed: ${res.status}`);
  }
  const raw = (await res.json()) as {
    success?: boolean;
    data?: TokenResponse;
  } & Partial<TokenResponse>;
  const tokens = raw.data ?? raw;
  if (!tokens || typeof tokens.accessToken !== 'string' || tokens.accessToken.length === 0) {
    throw new Error('auth response missing access token');
  }
  return {
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
  };
}

function browserStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
  } catch {
    // Sandboxed iframe without same-origin permission throws SecurityError
    return null;
  }
  return null;
}

function getStoredToken(): string | null {
  try {
    return browserStorage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

function storeTokens(tokens: TokenResponse): void {
  try {
    const storage = browserStorage();
    if (!storage) return;
    storage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    if (tokens.refreshToken) storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } catch {
    // Sandboxed iframe or quota restrictions
  }
}

function clearStoredTokens(): void {
  try {
    const storage = browserStorage();
    if (!storage) return;
    storage.removeItem(ACCESS_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Sandboxed iframe restrictions
  }
}
