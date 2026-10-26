'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
// NOTE (fix/qm-login-paint-vs-gmail): `../lib/offline/mail-cache` and
// `../lib/offline/outbox` are deliberately NOT statically imported. They pull
// in the IndexedDB client, the sqlite-fts5 indexer, and the 2000-line
// api-client — thousands of lines that used to land in EVERY route chunk
// mounting AuthProvider, including the public /login shell. Both are only
// ever needed at logout, so they load on demand there instead; the first
// logout pays one extra chunk fetch, sign-in pays nothing.
import { getQueryClient } from '../lib/query-client-registry';
import {
  browserAuthSession,
  cleanupLegacyBrowserTokens,
  isTwoFactorChallenge,
  type BrowserAccessSession,
} from '../services/browser-auth-session';
import { resolveSessionUser } from '../services/session-user';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
}

/**
 * `login` no longer implies a session. An account with a second factor stops
 * here and the caller has to decide what to render, so the outcome is returned
 * rather than signalled by a thrown error.
 */
export type LoginOutcome =
  | { status: 'signed-in' }
  | { status: 'two-factor-required'; expiresIn: number };

/** Structured error lets the form distinguish an expired challenge from a bad code. */
class AuthFlowError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AuthFlowError';
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  /** True between a password accepted and its second factor answered. */
  isTwoFactorPending: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  /**
   * Passwordless sign-in with a registered passkey. The browser ceremony
   * itself (navigator.credentials.get) runs in the caller — this provider
   * only owns the server legs — so the caller passes the finished
   * assertion response plus the challenge token from the options leg.
   * The outcome shape is exactly `login`'s: a TOTP-protected account whose
   * assertion carried no user verification stops at 'two-factor-required'
   * instead of a session.
   */
  loginWithPasskey: (
    email: string,
    response: unknown,
    challengeToken: string,
  ) => Promise<LoginOutcome>;
  completeTwoFactor: (code: string) => Promise<void>;
  cancelTwoFactor: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
  skipSessionRestore = false,
}: {
  children: React.ReactNode;
  /**
   * fix/qm-api-roundtrip-latency: the root layout sets this when the
   * HttpOnly `quantmail_refresh` cookie is provably absent (server-side
   * check). There is no session to restore — skipping the POST
   * /api/auth/refresh saves every signed-out visitor a ~1.3s round trip on
   * every page load (the refresh would 401 anyway, after paying the full
   * proxy chain). Local cleanup still runs; only the network call is
   * skipped.
   */
  skipSessionRestore?: boolean;
}) {
  // No `useQueryClient()` here, deliberately: the public auth shell renders
  // this provider with no QueryClientProvider above it (lean auth shell), and
  // on the app shell this provider is hoisted above QueryProvider so the
  // session survives the /login → / transition. The query client is reached
  // through the module registry instead — see `lib/query-client-registry.ts`.
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTwoFactorPending, setIsTwoFactorPending] = useState(false);
  // A ref, not state, and never localStorage: the challenge is a credential in
  // its own right, and the only thing that should outlive this tab's memory is
  // the HttpOnly cookie the server sets once the second factor is answered.
  const challengeRef = useRef<string | null>(null);

  const clearMemorySession = useCallback(() => {
    browserAuthSession.clearAccessToken();
    challengeRef.current = null;
    setIsTwoFactorPending(false);
    setUser(null);
  }, []);

  const fetchProfile = useCallback(async (): Promise<AuthUser> => {
    // Imported lazily: the public auth shell must not pay for the
    // authenticated API-client chunk until a session actually exists to use
    // it. On the auth shell this only runs after a successful sign-in.
    const { apiClient } = await import('../services/api-client');
    const profile = await apiClient.getUserInfo();
    if (!profile.success || !profile.data) {
      throw new Error(profile.error?.message || 'Could not load your profile.');
    }
    return {
      id: profile.data.id,
      email: profile.data.email,
      username: profile.data.username,
      displayName: profile.data.displayName,
      role: profile.data.role,
    };
  }, []);

  /** Hydrate state from a session response: embedded profile if present, /oauth/userinfo otherwise. */
  const applySessionUser = useCallback(
    async (data: BrowserAccessSession | undefined) => {
      setUser(await resolveSessionUser(data, fetchProfile));
    },
    [fetchProfile],
  );

  useEffect(() => {
    // Lazy for the same reason as fetchProfile: on the public auth shell there
    // are no authenticated API calls to observe 401s from, so the chunk can
    // wait until it is actually needed. The callback is stable and the client
    // is a module singleton, so re-subscribing on remount simply overwrites.
    let cancelled = false;
    void import('../services/api-client').then((m) => {
      if (!cancelled) m.apiClient.onAuthenticationError(clearMemorySession);
    });
    return () => {
      cancelled = true;
    };
  }, [clearMemorySession]);

  // Fail closed on every load: erase all historical JavaScript-readable token
  // formats, then restore only from the server-managed HttpOnly refresh cookie.
  useEffect(() => {
    let active = true;

    async function hydrate() {
      cleanupLegacyBrowserTokens();
      clearMemorySession();
      // fix/qm-api-roundtrip-latency: when the server already proved there is
      // no refresh cookie, there is no session to restore — skip the network
      // refresh entirely (it would 401 after paying the full chain). The
      // provider still settles `isLoading` so public pages paint immediately.
      if (skipSessionRestore) {
        if (active) setIsLoading(false);
        return;
      }
      try {
        // One timeout for the refresh, another for the profile load. The
        // refresh used to be the only raced call — a slow `/oauth/userinfo`
        // then left the app on "Authenticating..." for up to 30s (the fetch
        // timeout) because the profile leg was not timeout-bound. Both legs
        // now fail closed within 5s each, so the gate can never hang the
        // first visit to an authenticated route.
        const timeout = (ms: number) =>
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), ms));
        const session = await Promise.race([browserAuthSession.refresh(), timeout(5000)]);
        if (!active || !session.success || !session.data?.accessToken) return;
        // The refresh response now embeds the user profile, so hydration is a
        // single round trip; applySessionUser only falls back to /oauth/userinfo
        // for backends that don't embed one yet.
        await Promise.race([applySessionUser(session.data), timeout(5000)]);
      } catch {
        // Auth failed or timed out — go to login
        if (active) clearMemorySession();
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [clearMemorySession, applySessionUser, skipSessionRestore]);

  // Rotate before the 15-minute access token expires. The rotated refresh token
  // remains inside the HttpOnly cookie and never enters this provider.
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(
      async () => {
        const session = await browserAuthSession.refresh();
        if (!session.success || !session.data?.accessToken) {
          clearMemorySession();
        }
      },
      12 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [user, clearMemorySession]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      setError(null);
      setIsLoading(true);
      cleanupLegacyBrowserTokens();
      try {
        const session = await browserAuthSession.login(email, password);
        if (!session.success || !session.data) {
          throw new Error(session.error?.message || 'Login failed');
        }

        if (isTwoFactorChallenge(session.data)) {
          challengeRef.current = session.data.challenge;
          setIsTwoFactorPending(true);
          return { status: 'two-factor-required', expiresIn: session.data.expiresIn };
        }

        if (!session.data.accessToken) {
          throw new Error('Login failed');
        }
        // /auth/login embeds the profile; only older backends need the
        // /oauth/userinfo round trip.
        await applySessionUser(session.data);
        return { status: 'signed-in' };
      } catch (caught) {
        clearMemorySession();
        const message = caught instanceof Error ? caught.message : 'Login failed';
        setError(message);
        throw caught;
      } finally {
        setIsLoading(false);
      }
    },
    [clearMemorySession, applySessionUser],
  );

  const completeTwoFactor = useCallback(
    async (code: string) => {
      const challenge = challengeRef.current;
      if (!challenge) {
        const message = 'This sign-in attempt is no longer valid. Enter your password again.';
        setError(message);
        throw new AuthFlowError(message, 'CHALLENGE_EXPIRED');
      }

      setError(null);
      setIsLoading(true);
      let sessionIssued = false;
      try {
        const session = await browserAuthSession.completeTwoFactor(challenge, code);
        if (!session.success || !session.data?.accessToken) {
          throw new AuthFlowError(
            session.error?.message || 'That code was not accepted.',
            session.error?.code || 'TWO_FACTOR_FAILED',
          );
        }
        sessionIssued = true;
        try {
          // /auth/2fa/verify embeds the profile; only older backends need the
          // /oauth/userinfo round trip.
          await applySessionUser(session.data);
        } catch {
          throw new AuthFlowError(
            'Your code was accepted, but the session could not be initialized. Sign in again.',
            'SESSION_INITIALIZATION_FAILED',
          );
        }
        // Drop the password-proof challenge only after the browser session and
        // profile are both ready. It carries no app authority by itself.
        challengeRef.current = null;
        setIsTwoFactorPending(false);
      } catch (caught) {
        const flowError =
          caught instanceof AuthFlowError
            ? caught
            : new AuthFlowError('That code was not accepted.', 'TWO_FACTOR_FAILED');

        if (sessionIssued) {
          // A refresh cookie and access token were minted before profile
          // hydration failed. Revoke/clear both so UI state cannot say signed
          // out while credentials remain live.
          try {
            await browserAuthSession.logout();
          } catch {
            browserAuthSession.clearAccessToken();
          }
          clearMemorySession();
        } else if (flowError.code === 'CHALLENGE_EXPIRED') {
          challengeRef.current = null;
          setIsTwoFactorPending(false);
        }

        setError(flowError.message);
        throw flowError;
      } finally {
        setIsLoading(false);
      }
    },
    [clearMemorySession, applySessionUser],
  );

  const loginWithPasskey = useCallback(
    async (email: string, response: unknown, challengeToken: string): Promise<LoginOutcome> => {
      setError(null);
      setIsLoading(true);
      cleanupLegacyBrowserTokens();
      try {
        const session = await browserAuthSession.passkeyLoginVerify(email, response, challengeToken);
        if (!session.success || !session.data) {
          throw new Error(session.error?.message || 'Passkey sign-in failed');
        }
        if (isTwoFactorChallenge(session.data)) {
          challengeRef.current = session.data.challenge;
          setIsTwoFactorPending(true);
          return { status: 'two-factor-required', expiresIn: session.data.expiresIn };
        }
        if (!session.data.accessToken) {
          throw new Error('Passkey sign-in failed');
        }
        await applySessionUser(session.data);
        return { status: 'signed-in' };
      } catch (caught) {
        clearMemorySession();
        const message = caught instanceof Error ? caught.message : 'Passkey sign-in failed';
        setError(message);
        throw caught;
      } finally {
        setIsLoading(false);
      }
    },
    [clearMemorySession, applySessionUser],
  );

  const cancelTwoFactor = useCallback(() => {
    challengeRef.current = null;
    setIsTwoFactorPending(false);
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await browserAuthSession.logout();
    } finally {
      cleanupLegacyBrowserTokens();
      clearMemorySession();
      setError(null);
      // Offline-first means the previous account's mail is sitting in IndexedDB,
      // and its unsent archives are sitting in the outbox. Neither is scoped to a
      // session, so without this the next person to sign in on this browser opens
      // to someone else's inbox until the first fetch lands, and their queued
      // mutations replay against the new token.
      //
      // The outbox goes first: it is the half that can still make network calls.
      // A flush already in flight will fail against the revoked token, and its
      // entries are gone, so nothing is retried.
      //
      // Deliberately not awaited and never allowed to throw — a wedged IndexedDB
      // must not be able to strand someone in a signed-in shell. Loaded
      // dynamically (see module header): the offline stores must not bloat
      // the initial chunk of routes like /login that never call logout.
      void import('../lib/offline/outbox')
        .then((outbox) => outbox.clearOutbox())
        .then(() => import('../lib/offline/mail-cache'))
        .then((mailCache) => mailCache.clearMailCache())
        .catch(() => {
          /* best effort: the session is already gone either way */
        });
      // Via the registry, not `useQueryClient()`: this provider renders with
      // no QueryClientProvider above it on the public auth shell. No-op there
      // (logout is only reachable from authenticated UI, where the provider —
      // and its registered client — is always mounted).
      getQueryClient()?.clear();
    }
  }, [clearMemorySession]);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    error,
    isTwoFactorPending,
    login,
    loginWithPasskey,
    completeTwoFactor,
    cancelTwoFactor,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useOptionalAuth(): AuthContextValue | undefined {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
