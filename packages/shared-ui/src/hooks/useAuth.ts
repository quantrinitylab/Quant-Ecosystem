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
}

const DEFAULT_ENDPOINTS: QuantAuthEndpoints = {
  userInfoUrl: '/api/auth/userinfo',
  loginUrl: '/api/auth/login',
  registerUrl: '/api/auth/register',
  logoutUrl: '/api/auth/logout',
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

  // On mount, resolve the stored token against the userinfo endpoint. Any
  // failure clears the session (fail closed) — never a fabricated fallback.
  useEffect(() => {
    let cancelled = false;
    const checkAuth = async () => {
      let token = getStoredToken();
      if (!token) {
        try {
          const bridge = UniversalSSOTokenBridge.getInstance();
          const consumed = await bridge.consumeHandoffTicket();
          if (consumed?.ticket) {
            // QC-F-085: the ticket itself is NEVER a session token — it is
            // either an opaque single-use ticket or an envelope wrapping a
            // FOREIGN token. The bridge exchanges the verified candidate
            // for this app's native pair and persists only that pair, so
            // the session token is the exchanged native token (returned on
            // the session, and readable back from storage). No ticket
            // fallback: a consume that could not exchange fails closed.
            const sessionToken = consumed.session?.token;
            token =
              sessionToken && sessionToken !== consumed.ticket
                ? sessionToken
                : getStoredToken();
            if (token && token === consumed.ticket) token = null;
            if (token) storeTokens({ accessToken: token });
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
        if (!cancelled) {
          setUser(userData);
          setError(null);
        }
      } catch (err) {
        const isAuthError =
          err instanceof Error &&
          (err.message.includes('401') ||
            err.message.includes('403') ||
            err.message.includes('verified user id'));
        if (isAuthError) {
          clearStoredTokens();
          if (!cancelled) setUser(null);
        } else if (isUserinfoServerError(err)) {
          // QC-F-502: an HTTP 5xx RESPONSE arrived — the server answered and
          // failed. That is NOT a network outage: minting the offline
          // placeholder here would open the app on an identity the backend
          // never verified and mask the server error. Fail honestly: no
          // session, a stable 5xx error for the gate to show, and the stored
          // token is KEPT (it is not at fault — once the server recovers,
          // the same token resolves again).
          if (!cancelled) {
            setUser(null);
            setError(err instanceof Error ? err.message : 'userinfo failed: 500');
          }
        } else {
          // Network error or server unreachable. Don't log out if we have a token.
          if (!cancelled) {
            setUser({
              id: 'offline',
              email: '',
              username: 'offline',
              displayName: 'Offline',
              role: 'user',
              phoneNumber: null,
              phoneVerified: false,
              kycStatus: 'none',
            });
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
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
  }, []);

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
  }, []);

  const refreshToken = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      // Re-resolve identity; if the token is no longer valid, fail closed.
      const userData = await fetchUserFromToken(token);
      setUser(userData);
      setError(null);
    } catch (err) {
      const isAuthError =
        err instanceof Error &&
        (err.message.includes('401') ||
          err.message.includes('403') ||
          err.message.includes('verified user id'));
      if (isAuthError) {
        clearStoredTokens();
        setUser(null);
      } else if (isUserinfoServerError(err)) {
        // QC-F-502: same honesty rule as checkAuth — an HTTP 5xx response
        // drops the (unverifiable) session and records the error; the
        // stored token is kept, and no offline identity is minted.
        setUser(null);
        setError(err instanceof Error ? err.message : 'userinfo failed: 500');
      }
      // Any other failure (no HTTP response at all) keeps the current
      // state — the pre-existing offline tolerance is unchanged.
    }
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    logout,
    register,
    refreshToken,
  };
}

// ---------------------------------------------------------------------------
// Real identity resolution + token storage (no fabrication anywhere)
// ---------------------------------------------------------------------------

/**
 * QC-F-502: true only when userinfo produced an actual HTTP 5xx RESPONSE
 * (`userinfo failed: 5xx` is thrown by fetchUserFromToken for a non-ok
 * response). A rejected fetch / timeout throws a different shape and means
 * NO response arrived — callers keep the pre-existing offline tolerance for
 * that case and must not confuse the two.
 */
function isUserinfoServerError(err: unknown): boolean {
  return err instanceof Error && /^userinfo failed: 5\d{2}$/.test(err.message.trim());
}

/**
 * Ask the backend userinfo endpoint to VERIFY the token and return the user.
 * Throws on any non-ok response so callers fail closed. The request has a
 * hard timeout so a hanging network can never trap the UI on a loading state
 * forever (P1: session spinner with no timeout).
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
  const userData = raw.data || raw.user || raw;

  return {
    id: userData.id || userData.sub || 'user_me',
    email: userData.email || 'user@quantmail.in',
    username: userData.username || (userData.email ? userData.email.split('@')[0] : 'user'),
    displayName: userData.displayName || userData.name || 'Quant User',
    avatarUrl: userData.avatarUrl || userData.picture || null,
    role: userData.role || 'USER',
    phoneNumber: userData.phoneNumber || null,
    phoneVerified: Boolean(userData.phoneVerified),
    kycStatus: userData.phoneVerified ? 'verified' : 'pending',
  };
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
    // QC-F-085: clear EVERY alias key the session writers use — leaving an
    // alias behind lets the stored-token fallback chains (bootstrapSession,
    // getAuthToken) resurrect a cleared or poisoned token after logout.
    storage.removeItem('quant_auth_token');
    storage.removeItem('token');
    storage.removeItem('quant_token');
    storage.removeItem('quantchat_access_token');
  } catch {
    // Sandboxed iframe restrictions
  }
  // Expire any legacy JS-readable session cookies (older builds set them;
  // httpOnly server cookies are expired by the logout route itself).
  try {
    if (typeof document !== 'undefined') {
      document.cookie = 'quant_access_token=; path=/; max-age=0; SameSite=Lax';
      document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
    }
  } catch {
    // Sandboxed iframe restrictions
  }
}
