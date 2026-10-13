'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { clearMailCache } from '../lib/offline/mail-cache';
import { clearOutbox } from '../lib/offline/outbox';
import { getQueryClient } from '../lib/query-client-registry';
import {
  browserAuthSession,
  cleanupLegacyBrowserTokens,
  isTwoFactorChallenge,
  type BrowserSessionUser,
} from '../services/browser-auth-session';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
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

  const loadProfile = useCallback(async () => {
    // Imported lazily: the public auth shell must not pay for the
    // authenticated API-client chunk until a session actually exists to use
    // it. On the auth shell this only runs after a successful sign-in.
    const { apiClient } = await import('../services/api-client');
    const profile = await apiClient.getUserInfo();
    if (!profile.success || !profile.data) {
      throw new Error(profile.error?.message || 'Could not load your profile.');
    }
    setUser(profile.data);
  }, []);

  // fix/qm-api-roundtrip-latency: the session-issuing endpoints now carry the
  // profile inline (same shape as GET /oauth/userinfo), so a successful
  // refresh/login/2FA no longer needs the second sequential profile round
  // trip. Kept as a separate function so hydrate/login/completeTwoFactor share
  // the one fallback rule: inline user wins, otherwise the profile fetch
  // (older backends during rolling deploys omit the field).
  const adoptInlineUser = useCallback(
    async (inlineUser: BrowserSessionUser | undefined) => {
      if (inlineUser) {
        setUser({
          id: inlineUser.id,
          email: inlineUser.email,
          username: inlineUser.username,
          displayName: inlineUser.displayName,
          role: inlineUser.role,
        });
      } else {
        await loadProfile();
      }
    },
    [loadProfile],
  );

  useEffect(() => {
    // Lazy for the same reason as loadProfile: on the public auth shell there
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
        // timeout) because `loadProfile()` was not timeout-bound. Both legs
        // now fail closed within 5s each, so the gate can never hang the
        // first visit to an authenticated route.
        const timeout = (ms: number) =>
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), ms));
        const session = await Promise.race([browserAuthSession.refresh(), timeout(5000)]);
        if (!active || !session.success || !session.data?.accessToken) return;
        // fix/qm-api-roundtrip-latency: refresh now carries the profile
        // inline — the second sequential round trip is gone.
        await Promise.race([adoptInlineUser(session.data.user), timeout(5000)]);
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
  }, [clearMemorySession, adoptInlineUser, skipSessionRestore]);

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
        // fix/qm-api-roundtrip-latency: login carries the profile inline —
        // skip the second round trip (falls back to the profile fetch on
        // older backends).
        await adoptInlineUser(session.data.user);
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
    [clearMemorySession, loadProfile],
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
          // fix/qm-api-roundtrip-latency: the 2FA verify response carries the
          // profile inline — skip the second round trip (falls back to the
          // profile fetch on older backends).
          await adoptInlineUser(session.data.user);
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
    [clearMemorySession, loadProfile],
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
      // must not be able to strand someone in a signed-in shell.
      void clearOutbox()
        .then(() => clearMailCache())
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
