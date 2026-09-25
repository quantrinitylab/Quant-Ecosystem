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
          const consumed = bridge.consumeHandoffTicket();
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
      } catch {
        clearStoredTokens();
        if (!cancelled) setUser(null);
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
    } catch {
      clearStoredTokens();
      setUser(null);
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
 * Ask the backend userinfo endpoint to VERIFY the token and return the user.
 * Throws on any non-ok response so callers fail closed.
 */
async function fetchUserFromToken(token: string): Promise<AuthUser> {
  const res = await fetch(endpoints.userInfoUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`userinfo failed: ${res.status}`);
  }
  const raw = (await res.json()) as {
    success?: boolean;
    data?: Partial<AuthUser>;
  } & Partial<AuthUser>;
  // Accept both a bare user object and a { success, data } envelope.
  const u = raw.data ?? raw;
  if (!u || typeof u.id !== 'string' || u.id.length === 0) {
    throw new Error('userinfo returned no verified user id');
  }
  return {
    id: u.id,
    email: u.email ?? '',
    username: u.username ?? '',
    displayName: u.displayName ?? u.username ?? '',
    ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}),
    role: u.role ?? 'user',
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
  } catch {
    // Sandboxed iframe restrictions
  }
}
